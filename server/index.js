import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import express from 'express';
import multer from 'multer';
import QRCode from 'qrcode';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const uploadDir = path.join(rootDir, 'uploads');
const dataDir = path.join(rootDir, 'data');
const photosFile = path.join(dataDir, 'photos.json');
const challengesFile = path.join(dataDir, 'challenges.json');
const assignmentsFile = path.join(dataDir, 'challenge-assignments.json');
const apiPort = Number(process.env.API_PORT || 4174);
const clientPort = Number(process.env.CLIENT_PORT || 6173);
const maxVideoSeconds = 8;
const uploadLimitBytes = 120 * 1024 * 1024;
const s3Bucket = process.env.S3_BUCKET || '';
const s3Region = process.env.S3_REGION || process.env.AWS_REGION || 'us-east-1';
const s3UploadPrefix = String(process.env.S3_UPLOAD_PREFIX || 'uploads').replace(/^\/+|\/+$/g, '');
const cloudFrontDomain = String(process.env.CLOUDFRONT_DOMAIN || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
const s3Client = s3Bucket ? new S3Client({ region: s3Region }) : null;
const s3Enabled = Boolean(s3Bucket && cloudFrontDomain && s3Client);
const videoExtensions = new Set(['.mp4', '.mov', '.m4v', '.webm']);
const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif']);
const allowedExtensions = new Set([...imageExtensions, ...videoExtensions]);

fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(dataDir, { recursive: true });

if (!fs.existsSync(photosFile)) {
  fs.writeFileSync(photosFile, '[]\n');
}

if (!fs.existsSync(assignmentsFile)) {
  fs.writeFileSync(assignmentsFile, '[]\n');
}

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (_req, file, cb) => {
    const extension = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    cb(null, `${Date.now()}-${crypto.randomUUID()}${extension}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: uploadLimitBytes,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const extension = path.extname(file.originalname || '').toLowerCase();

    if (
      file.mimetype?.startsWith('image/') ||
      file.mimetype?.startsWith('video/') ||
      allowedExtensions.has(extension)
    ) {
      cb(null, true);
      return;
    }

    cb(new Error('Envie apenas fotos ou vídeos.'));
  },
});

const app = express();
app.use(express.json());
app.use('/uploads', express.static(uploadDir));

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function readPhotos() {
  return readJson(photosFile, []);
}

function writePhotos(photos) {
  writeJson(photosFile, photos);
}

function readChallenges() {
  return readJson(challengesFile, []);
}

function writeChallenges(challenges) {
  writeJson(challengesFile, challenges);
}

function readAssignments() {
  return readJson(assignmentsFile, []);
}

function writeAssignments(assignments) {
  writeJson(assignmentsFile, assignments);
}

function normalizeName(name) {
  return String(name || '').trim().slice(0, 80) || 'Convidado';
}

function getMediaType(input = {}) {
  const mimetype = typeof input === 'string' ? input : input.mimetype || '';
  const filenames =
    typeof input === 'string'
      ? []
      : [input.originalName, input.originalname, input.filename, input.url].filter(Boolean);

  const hasVideoExtension = filenames.some((filename) =>
    videoExtensions.has(path.extname(filename).toLowerCase()),
  );

  if (mimetype.startsWith('video/') || hasVideoExtension) {
    return 'video';
  }

  return 'image';
}

function normalizeContentType(mimetype = '', extension = '') {
  if (mimetype?.startsWith('image/') || mimetype?.startsWith('video/')) {
    return mimetype;
  }

  const byExtension = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.heic': 'image/heic',
    '.heif': 'image/heif',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.m4v': 'video/x-m4v',
    '.webm': 'video/webm',
  };

  return byExtension[extension] || 'application/octet-stream';
}

function sanitizeKeyPart(value = 'item') {
  return String(value || 'item')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'item';
}

function createS3ObjectKey({ deviceId = 'guest', originalName = 'media.jpg', mimetype = '' }) {
  const extension = path.extname(originalName || '').toLowerCase();
  const safeExtension = allowedExtensions.has(extension)
    ? extension
    : mimetype.startsWith('video/')
      ? '.mp4'
      : '.jpg';
  const day = new Date().toISOString().slice(0, 10);
  const safeDeviceId = sanitizeKeyPart(deviceId).slice(0, 48);

  return `${s3UploadPrefix}/${day}/${safeDeviceId}/${Date.now()}-${crypto.randomUUID()}${safeExtension}`;
}

function getCloudFrontUrl(objectKey) {
  return `https://${cloudFrontDomain}/${objectKey}`;
}

function isSafeS3ObjectKey(objectKey = '') {
  const key = String(objectKey || '');

  return key.startsWith(`${s3UploadPrefix}/`) && !key.includes('..') && !key.startsWith('/');
}

async function putFileToS3({ filePath, objectKey, contentType }) {
  await s3Client.send(new PutObjectCommand({
    Bucket: s3Bucket,
    Key: objectKey,
    Body: fs.createReadStream(filePath),
    ContentType: contentType,
  }));
}

async function deleteS3Object(objectKey) {
  if (!s3Enabled || !isSafeS3ObjectKey(objectKey)) {
    return;
  }

  await s3Client.send(new DeleteObjectCommand({
    Bucket: s3Bucket,
    Key: objectKey,
  }));
}

async function headS3Object(objectKey) {
  return s3Client.send(new HeadObjectCommand({
    Bucket: s3Bucket,
    Key: objectKey,
  }));
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args);
    let stderr = '';

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr || `ffmpeg saiu com código ${code}`));
    });
  });
}

async function normalizeUploadedMedia(file) {
  if (getMediaType(file) !== 'video') {
    return { ...file, mediaType: 'image' };
  }

  const inputPath = path.join(uploadDir, file.filename);
  const outputFilename = `${Date.now()}-${crypto.randomUUID()}.mp4`;
  const outputPath = path.join(uploadDir, outputFilename);

  try {
    await runFfmpeg([
      '-y',
      '-i',
      inputPath,
      '-t',
      String(maxVideoSeconds),
      '-map',
      '0:v:0',
      '-map',
      '0:a?',
      '-vf',
      'scale=trunc(iw/2)*2:trunc(ih/2)*2',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '24',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-movflags',
      '+faststart',
      '-shortest',
      outputPath,
    ]);

    fs.unlink(inputPath, () => {});

    return {
      ...file,
      filename: outputFilename,
      mimetype: 'video/mp4',
      size: fs.statSync(outputPath).size,
      mediaType: 'video',
    };
  } catch (error) {
    fs.unlink(outputPath, () => {});
    fs.unlink(inputPath, () => {});
    throw new Error('Não foi possível preparar esse vídeo. Tente gravar novamente em até 8 segundos.');
  }
}

async function persistUploadedFile(file, deviceId = 'guest') {
  if (!s3Enabled) {
    return {
      ...file,
      url: `/uploads/${file.filename}`,
      storageProvider: 'local',
      storageKey: '',
    };
  }

  const extension = path.extname(file.filename || file.originalname || '').toLowerCase();
  const contentType = normalizeContentType(file.mimetype, extension);
  const objectKey = createS3ObjectKey({
    deviceId,
    originalName: file.filename || file.originalname,
    mimetype: contentType,
  });
  const filePath = path.join(uploadDir, file.filename);

  await putFileToS3({
    filePath,
    objectKey,
    contentType,
  });

  fs.unlink(filePath, () => {});

  return {
    ...file,
    filename: path.basename(objectKey),
    url: getCloudFrontUrl(objectKey),
    mimetype: contentType,
    storageProvider: 's3',
    storageKey: objectKey,
  };
}

async function normalizeExistingVideos() {
  const photos = readPhotos();
  let changed = false;

  for (let index = 0; index < photos.length; index += 1) {
    const photo = photos[index];

    if (getMediaType(photo) !== 'video' || photo.videoCodecNormalized) {
      continue;
    }

    const filename = path.basename(photo.filename || photo.url || '');
    const filePath = path.join(uploadDir, filename);

    if (!filename || !fs.existsSync(filePath)) {
      continue;
    }

    try {
      const normalized = await persistUploadedFile(
        await normalizeUploadedMedia({
          filename,
          originalname: photo.originalName || filename,
          mimetype: photo.mimetype || '',
          size: photo.size || 0,
        }),
        photo.deviceId || 'guest',
      );

      photos[index] = {
        ...photo,
        filename: normalized.filename,
        url: `/uploads/${normalized.filename}`,
        mimetype: normalized.mimetype,
        size: normalized.size,
        mediaType: 'video',
        storageProvider: normalized.storageProvider,
        storageKey: normalized.storageKey,
        videoCodecNormalized: true,
      };
      changed = true;
      writePhotos(photos);
    } catch (error) {
      console.error(`Falha ao normalizar vídeo ${photo.id}: ${error.message}`);
    }
  }

  if (changed) {
    writePhotos(photos);
  }
}

async function migrateExistingLocalMediaToS3() {
  if (!s3Enabled) {
    return;
  }

  const photos = readPhotos();
  let changed = false;

  for (let index = 0; index < photos.length; index += 1) {
    const photo = photos[index];

    if (photo.storageProvider === 's3') {
      continue;
    }

    const filename = path.basename(photo.filename || photo.url || '');
    const filePath = path.join(uploadDir, filename);

    if (!filename || !fs.existsSync(filePath)) {
      continue;
    }

    try {
      const baseFile = {
        filename,
        originalname: photo.originalName || filename,
        mimetype: photo.mimetype || '',
        size: photo.size || fs.statSync(filePath).size,
      };
      const normalizedFile =
        getMediaType(photo) === 'video' && !photo.videoCodecNormalized
          ? await normalizeUploadedMedia(baseFile)
          : {
              ...baseFile,
              mediaType: getMediaType(photo),
            };
      const persisted = await persistUploadedFile(normalizedFile, photo.deviceId || 'guest');

      photos[index] = {
        ...photo,
        filename: persisted.filename,
        url: persisted.url,
        mimetype: persisted.mimetype,
        size: persisted.size,
        mediaType: persisted.mediaType,
        storageProvider: persisted.storageProvider,
        storageKey: persisted.storageKey,
        videoCodecNormalized: persisted.mediaType === 'video' ? true : photo.videoCodecNormalized || false,
      };
      changed = true;
      writePhotos(photos);
    } catch (error) {
      console.error(`Falha ao migrar mídia ${photo.id}: ${error.message}`);
    }
  }

  if (changed) {
    writePhotos(photos);
  }
}

function getModerationStatus(photo = {}) {
  const status = String(photo.moderationStatus || '').trim();

  if (['pending', 'approved', 'rejected'].includes(status)) {
    return status;
  }

  return 'approved';
}

function normalizeReactions(input) {
  if (!input) {
    return [];
  }

  try {
    const parsed = typeof input === 'string' ? JSON.parse(input) : input;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => ({
        id: String(item.id || '').slice(0, 40),
        label: String(item.label || '').slice(0, 40),
        symbol: String(item.symbol || '').slice(0, 8),
      }))
      .filter((item) => item.id && item.label)
      .slice(0, 6);
  } catch {
    return [];
  }
}

function normalizeReaction(input = {}) {
  const reaction = {
    id: String(input.id || '').slice(0, 40),
    label: String(input.label || '').slice(0, 40),
    symbol: String(input.symbol || '').slice(0, 8),
  };

  if (!reaction.id || !reaction.label) {
    return null;
  }

  return reaction;
}

function normalizeReactionVotes(input) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((item) => {
      const reaction = normalizeReaction(item);

      if (!reaction) {
        return null;
      }

      return {
        ...reaction,
        deviceId: String(item.deviceId || '').slice(0, 120),
        reactedAt: item.reactedAt || new Date().toISOString(),
      };
    })
    .filter((item) => item?.deviceId);
}

function aggregateReactionVotes(votes) {
  const byReaction = new Map();

  votes.forEach((vote) => {
    const current = byReaction.get(vote.id) || {
      id: vote.id,
      label: vote.label,
      symbol: vote.symbol,
      count: 0,
    };
    current.count += 1;
    byReaction.set(vote.id, current);
  });

  return Array.from(byReaction.values()).sort((a, b) => b.count - a.count);
}

function withMediaDefaults(photo) {
  const reactionVotes = normalizeReactionVotes(photo.reactionVotes);
  const aggregatedReactions = aggregateReactionVotes(reactionVotes);
  const legacyReactions = normalizeReactions(photo.reactions).map((reaction) => ({
    ...reaction,
    count: reaction.count || 1,
  }));

  return {
    ...photo,
    mediaType: getMediaType(photo),
    moderationStatus: getModerationStatus(photo),
    reactions: aggregatedReactions.length ? aggregatedReactions : legacyReactions,
    reactionVotes,
  };
}

function normalizeChallenge(input = {}) {
  const now = new Date().toISOString();

  return {
    id: String(input.id || crypto.randomUUID()),
    title: String(input.title || '').trim().slice(0, 120),
    description: String(input.description || '').trim().slice(0, 240),
    category: String(input.category || 'Geral').trim().slice(0, 60),
    active: Boolean(input.active ?? true),
    startsAt: String(input.startsAt || '').trim(),
    endsAt: String(input.endsAt || '').trim(),
    createdAt: input.createdAt || now,
    updatedAt: now,
  };
}

function getChallengeStatus(challenge, now = new Date()) {
  if (!challenge.active) {
    return 'paused';
  }

  const startsAt = challenge.startsAt ? new Date(challenge.startsAt) : null;
  const endsAt = challenge.endsAt ? new Date(challenge.endsAt) : null;

  if (startsAt && Number.isFinite(startsAt.getTime()) && startsAt > now) {
    return 'scheduled';
  }

  if (endsAt && Number.isFinite(endsAt.getTime()) && endsAt < now) {
    return 'expired';
  }

  return 'available';
}

function withChallengeStatus(challenge, now = new Date()) {
  return {
    ...challenge,
    status: getChallengeStatus(challenge, now),
  };
}

function getAvailableChallenges(now = new Date()) {
  return readChallenges()
    .map((challenge) => withChallengeStatus(challenge, now))
    .filter((challenge) => challenge.status === 'available');
}

function pickChallengeForDevice(deviceId, forceNew = false) {
  const now = new Date();
  const available = getAvailableChallenges(now);

  if (!available.length) {
    return { assignment: null, challenge: null, availableCount: 0 };
  }

  const assignments = readAssignments();
  const currentAssignment = assignments.find((assignment) => assignment.deviceId === deviceId);
  const currentChallenge = currentAssignment
    ? available.find((challenge) => challenge.id === currentAssignment.challengeId)
    : null;

  if (currentAssignment && currentChallenge && !forceNew) {
    return {
      assignment: currentAssignment,
      challenge: currentChallenge,
      availableCount: available.length,
    };
  }

  const usedByOtherDevices = new Set(
    assignments
      .filter((assignment) => assignment.deviceId !== deviceId)
      .map((assignment) => assignment.challengeId),
  );
  const freshPool = available.filter((challenge) => !usedByOtherDevices.has(challenge.id));
  const pool = (freshPool.length ? freshPool : available).filter(
    (challenge) => !forceNew || challenge.id !== currentAssignment?.challengeId,
  );
  const finalPool = pool.length ? pool : available;
  const selected = finalPool[Math.floor(Math.random() * finalPool.length)];
  const nextAssignment = {
    id: currentAssignment?.id || crypto.randomUUID(),
    deviceId,
    challengeId: selected.id,
    assignedAt: new Date().toISOString(),
  };
  const nextAssignments = [
    ...assignments.filter((assignment) => assignment.deviceId !== deviceId),
    nextAssignment,
  ];

  writeAssignments(nextAssignments);

  return {
    assignment: nextAssignment,
    challenge: selected,
    availableCount: available.length,
  };
}

function getNetworkUrls() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  const publicPort = clientPort === 80 ? '' : `:${clientPort}`;

  Object.entries(interfaces).forEach(([name, values]) => {
    values
      ?.filter((item) => item.family === 'IPv4' && !item.internal)
      .forEach((item) => {
        addresses.push({
          label: name,
          host: item.address,
          guestUrl: `http://${item.address}${publicPort}/guest`,
          wallUrl: `http://${item.address}${publicPort}/wall`,
        });
      });
  });

  return addresses;
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/network', (req, res) => {
  const host = req.hostname === 'localhost' ? 'localhost' : req.hostname;
  const publicPort = clientPort === 80 ? '' : `:${clientPort}`;
  res.json({
    clientPort,
    apiPort,
    urls: getNetworkUrls(),
    fallback: {
      guestUrl: `http://${host}${publicPort}/guest`,
      wallUrl: `http://${host}${publicPort}/wall`,
    },
  });
});

app.get('/api/photos', (req, res) => {
  const status = String(req.query.status || 'approved');
  const deviceId = String(req.query.deviceId || '').trim().slice(0, 120);
  const includeMinePending = req.query.includeMinePending === 'true';
  let photos = readPhotos().map(withMediaDefaults);

  if (status === 'all') {
    photos = photos;
  } else if (['pending', 'approved', 'rejected'].includes(status)) {
    photos = photos.filter((photo) => photo.moderationStatus === status);
  } else {
    photos = photos.filter((photo) => photo.moderationStatus === 'approved');
  }

  if (includeMinePending && deviceId && status !== 'all') {
    const allPhotos = readPhotos().map(withMediaDefaults);
    const visibleIds = new Set(photos.map((photo) => photo.id));
    const mine = allPhotos.filter((photo) => photo.deviceId === deviceId && !visibleIds.has(photo.id));
    photos = [...photos, ...mine];
  }

  photos = photos.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ photos });
});

app.get('/api/challenges', (_req, res) => {
  const now = new Date();
  const challenges = readChallenges().map((challenge) => withChallengeStatus(challenge, now));
  res.json({ challenges, now: now.toISOString() });
});

app.post('/api/challenges', (req, res) => {
  const challenge = normalizeChallenge(req.body);

  if (!challenge.title) {
    res.status(400).json({ error: 'Informe um título para o desafio.' });
    return;
  }

  const challenges = readChallenges();
  challenges.push(challenge);
  writeChallenges(challenges);
  res.status(201).json({ challenge: withChallengeStatus(challenge) });
});

app.put('/api/challenges/:id', (req, res) => {
  const challenges = readChallenges();
  const index = challenges.findIndex((challenge) => challenge.id === req.params.id);

  if (index === -1) {
    res.status(404).json({ error: 'Desafio não encontrado.' });
    return;
  }

  const updated = normalizeChallenge({
    ...challenges[index],
    ...req.body,
    id: challenges[index].id,
    createdAt: challenges[index].createdAt,
  });

  if (!updated.title) {
    res.status(400).json({ error: 'Informe um título para o desafio.' });
    return;
  }

  challenges[index] = updated;
  writeChallenges(challenges);
  res.json({ challenge: withChallengeStatus(updated) });
});

app.post('/api/challenges/assignment', (req, res) => {
  const deviceId = String(req.body.deviceId || '').trim().slice(0, 120);

  if (!deviceId) {
    res.status(400).json({ error: 'Informe o deviceId.' });
    return;
  }

  const result = pickChallengeForDevice(deviceId, Boolean(req.body.forceNew));
  res.json(result);
});

app.get('/api/challenges/progress', (req, res) => {
  const deviceId = String(req.query.deviceId || '').trim().slice(0, 120);
  const now = new Date();
  const availableChallenges = readChallenges()
    .map((challenge) => withChallengeStatus(challenge, now))
    .filter((challenge) => challenge.status === 'available');
  const photos = readPhotos().map(withMediaDefaults);
  const devicePhotos = deviceId
    ? photos.filter((photo) => photo.deviceId === deviceId && photo.moderationStatus !== 'rejected')
    : [];
  const completedChallengeIds = new Set(
    devicePhotos
      .map((photo) => photo.challenge?.id)
      .filter(Boolean),
  );
  const checklist = availableChallenges.map((challenge) => {
    const completedPhoto = devicePhotos.find((photo) => photo.challenge?.id === challenge.id);

    return {
      ...challenge,
      completed: completedChallengeIds.has(challenge.id),
      completedAt: completedPhoto?.createdAt || null,
      completedMediaId: completedPhoto?.id || null,
    };
  });

  res.json({
    checklist,
    total: checklist.length,
    completed: checklist.filter((challenge) => challenge.completed).length,
  });
});

app.post('/api/uploads/presign', async (req, res) => {
  if (!s3Enabled) {
    res.status(501).json({ error: 'Upload direto para S3 não está configurado.' });
    return;
  }

  const deviceId = String(req.body.deviceId || '').trim().slice(0, 120);
  const originalName = String(req.body.fileName || 'media.jpg').trim().slice(0, 180);
  const extension = path.extname(originalName).toLowerCase();
  const contentType = normalizeContentType(String(req.body.contentType || ''), extension);
  const size = Number(req.body.size || 0);

  if (!deviceId) {
    res.status(400).json({ error: 'Informe o deviceId.' });
    return;
  }

  if (!allowedExtensions.has(extension) || !contentType.startsWith('image/')) {
    res.status(400).json({ error: 'Upload direto aceita fotos. Vídeos passam pela preparação automática.' });
    return;
  }

  if (!Number.isFinite(size) || size <= 0 || size > uploadLimitBytes) {
    res.status(400).json({ error: 'Arquivo inválido ou grande demais.' });
    return;
  }

  const objectKey = createS3ObjectKey({
    deviceId,
    originalName,
    mimetype: contentType,
  });

  const command = new PutObjectCommand({
    Bucket: s3Bucket,
    Key: objectKey,
    ContentType: contentType,
  });
  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });

  res.json({
    uploadUrl,
    objectKey,
    publicUrl: getCloudFrontUrl(objectKey),
    method: 'PUT',
    expiresIn: 300,
    headers: {
      'Content-Type': contentType,
    },
  });
});

app.post('/api/photos/register', async (req, res) => {
  if (!s3Enabled) {
    res.status(501).json({ error: 'Registro de mídia S3 não está configurado.' });
    return;
  }

  const objectKey = String(req.body.objectKey || '').trim();
  const deviceId = String(req.body.deviceId || crypto.randomUUID()).slice(0, 120);
  const mimetype = normalizeContentType(String(req.body.mimetype || ''), path.extname(objectKey).toLowerCase());

  if (!isSafeS3ObjectKey(objectKey)) {
    res.status(400).json({ error: 'Objeto S3 inválido.' });
    return;
  }

  if (!mimetype.startsWith('image/')) {
    res.status(400).json({ error: 'Registro direto aceita apenas fotos.' });
    return;
  }

  let head;
  try {
    head = await headS3Object(objectKey);
  } catch {
    res.status(400).json({ error: 'A foto ainda não chegou ao bucket.' });
    return;
  }

  const challenge = req.body.challengeId
    ? readChallenges().find((item) => item.id === req.body.challengeId)
    : null;
  const photo = {
    id: crypto.randomUUID(),
    guestName: normalizeName(req.body.guestName),
    deviceId,
    mediaType: 'image',
    reactions: normalizeReactions(req.body.reactions),
    reactionVotes: [],
    moderationStatus: 'pending',
    submittedAt: new Date().toISOString(),
    approvedAt: null,
    rejectedAt: null,
    moderationNote: '',
    challenge: challenge
      ? {
          id: challenge.id,
          title: challenge.title,
          category: challenge.category,
        }
      : null,
    originalName: String(req.body.originalName || path.basename(objectKey)).slice(0, 180),
    filename: path.basename(objectKey),
    url: getCloudFrontUrl(objectKey),
    mimetype,
    size: Number(head.ContentLength || req.body.size || 0),
    storageProvider: 's3',
    storageKey: objectKey,
    videoCodecNormalized: false,
    createdAt: new Date().toISOString(),
  };

  const photos = readPhotos();
  photos.push(photo);
  writePhotos(photos);
  res.status(201).json({ photo: withMediaDefaults(photo) });
});

app.post('/api/photos', upload.single('photo'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'Nenhuma mídia foi enviada.' });
    return;
  }

  let uploadedFile;
  try {
    uploadedFile = await persistUploadedFile(
      await normalizeUploadedMedia(req.file),
      req.body.deviceId,
    );
  } catch (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  const challenge = req.body.challengeId
    ? readChallenges().find((item) => item.id === req.body.challengeId)
    : null;
  const photo = {
    id: crypto.randomUUID(),
    guestName: normalizeName(req.body.guestName),
    deviceId: String(req.body.deviceId || crypto.randomUUID()).slice(0, 120),
    mediaType: uploadedFile.mediaType,
    reactions: normalizeReactions(req.body.reactions),
    reactionVotes: [],
    moderationStatus: 'pending',
    submittedAt: new Date().toISOString(),
    approvedAt: null,
    rejectedAt: null,
    moderationNote: '',
    challenge: challenge
      ? {
          id: challenge.id,
          title: challenge.title,
          category: challenge.category,
        }
      : null,
    originalName: uploadedFile.originalname,
    filename: uploadedFile.filename,
    url: uploadedFile.url,
    mimetype: uploadedFile.mimetype,
    size: uploadedFile.size,
    storageProvider: uploadedFile.storageProvider,
    storageKey: uploadedFile.storageKey,
    videoCodecNormalized: uploadedFile.mediaType === 'video',
    createdAt: new Date().toISOString(),
  };

  const photos = readPhotos();
  photos.push(photo);
  writePhotos(photos);
  res.status(201).json({ photo: withMediaDefaults(photo) });
});

app.delete('/api/photos/:id', async (req, res) => {
  const deviceId = String(req.body.deviceId || '').trim().slice(0, 120);

  if (!deviceId) {
    res.status(400).json({ error: 'Informe o deviceId para apagar.' });
    return;
  }

  const photos = readPhotos();
  const index = photos.findIndex((photo) => photo.id === req.params.id);

  if (index === -1) {
    res.status(404).json({ error: 'Mídia não encontrada.' });
    return;
  }

  const photo = photos[index];

  if (photo.deviceId !== deviceId) {
    res.status(403).json({ error: 'Você só pode apagar mídias enviadas por este celular.' });
    return;
  }

  photos.splice(index, 1);
  writePhotos(photos);

  if (photo.storageProvider === 's3' && photo.storageKey) {
    await deleteS3Object(photo.storageKey).catch(() => {});
  } else if (photo.filename) {
    fs.unlink(path.join(uploadDir, path.basename(photo.filename)), () => {});
  }

  res.json({ ok: true });
});

app.put('/api/photos/:id/moderation', (req, res) => {
  const nextStatus = String(req.body.moderationStatus || '').trim();

  if (!['pending', 'approved', 'rejected'].includes(nextStatus)) {
    res.status(400).json({ error: 'Status de moderação inválido.' });
    return;
  }

  const photos = readPhotos();
  const index = photos.findIndex((photo) => photo.id === req.params.id);

  if (index === -1) {
    res.status(404).json({ error: 'Mídia não encontrada.' });
    return;
  }

  const now = new Date().toISOString();
  const current = withMediaDefaults(photos[index]);
  const updated = {
    ...current,
    moderationStatus: nextStatus,
    moderationNote: String(req.body.moderationNote || '').slice(0, 240),
    moderatedAt: now,
    approvedAt: nextStatus === 'approved' ? now : null,
    rejectedAt: nextStatus === 'rejected' ? now : null,
  };

  photos[index] = updated;
  writePhotos(photos);
  res.json({ photo: withMediaDefaults(updated) });
});

app.post('/api/photos/:id/reactions', (req, res) => {
  const deviceId = String(req.body.deviceId || '').trim().slice(0, 120);
  const reaction = normalizeReaction(req.body.reaction);

  if (!deviceId || !reaction) {
    res.status(400).json({ error: 'Informe a reação e o deviceId.' });
    return;
  }

  const photos = readPhotos();
  const index = photos.findIndex((photo) => photo.id === req.params.id);

  if (index === -1) {
    res.status(404).json({ error: 'Mídia não encontrada.' });
    return;
  }

  const current = withMediaDefaults(photos[index]);

  if (current.moderationStatus !== 'approved') {
    res.status(403).json({ error: 'Só é possível reagir a mídias aprovadas.' });
    return;
  }

  const nextVotes = current.reactionVotes.filter((vote) => vote.deviceId !== deviceId);
  const existing = current.reactionVotes.find((vote) => vote.deviceId === deviceId);

  if (existing?.id !== reaction.id) {
    nextVotes.push({
      ...reaction,
      deviceId,
      reactedAt: new Date().toISOString(),
    });
  }

  const updated = {
    ...current,
    reactionVotes: nextVotes,
    reactions: aggregateReactionVotes(nextVotes),
  };

  photos[index] = updated;
  writePhotos(photos);
  res.json({ photo: withMediaDefaults(updated) });
});

app.get('/api/qr', async (req, res) => {
  const data = String(req.query.data || '');

  if (!data) {
    res.status(400).json({ error: 'Informe o parâmetro data.' });
    return;
  }

  try {
    const png = await QRCode.toBuffer(data, {
      width: 900,
      margin: 1,
      color: {
        dark: '#102b1c',
        light: '#fffdf2',
      },
    });

    res.setHeader('Content-Type', 'image/png');
    res.send(png);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.use((error, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof multer.MulterError) {
    const message =
      error.code === 'LIMIT_FILE_SIZE'
        ? 'Essa mídia ficou grande demais. Tente outra foto ou um vídeo menor.'
        : 'Não foi possível receber a mídia. Tente novamente.';
    res.status(400).json({ error: message });
    return;
  }

  if (error?.message === 'Envie apenas fotos ou vídeos.') {
    res.status(400).json({ error: error.message });
    return;
  }

  next(error);
});

const distDir = path.join(rootDir, 'dist');

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.listen(apiPort, '0.0.0.0', () => {
  console.log(`Upload API running at http://localhost:${apiPort}`);
  normalizeExistingVideos()
    .then(() => migrateExistingLocalMediaToS3())
    .catch((error) => {
      console.error(`Falha ao preparar mídias existentes: ${error.message}`);
    });
});
