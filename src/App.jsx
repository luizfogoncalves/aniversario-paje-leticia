import {
  Camera,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock3,
  Copy,
  Eye,
  Heart,
  Hourglass,
  ImageUp,
  Images,
  ListChecks,
  MessageCircle,
  MonitorPlay,
  PauseCircle,
  PlayCircle,
  Plus,
  QrCode,
  RefreshCw,
  Save,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  TimerOff,
  Trophy,
  UploadCloud,
  UserRound,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

const EVENT = {
  name: 'Aniversário da Letícia e Pajé',
  shortName: 'Letícia & Pajé',
  tagline: 'Memórias em clima de Brasil',
  match: 'Brasil x Marrocos',
  date: '13 jun 2026',
  time: '19h de Brasília',
  coverUrl: '/assets/brasilidade-banner-16x9-generated.png',
  guestProgram: { time: '19h', label: 'Brasil x Marrocos' },
  fullProgram: [
    { time: '16h', label: 'Cantor: Wester Guedes' },
    { time: '19h', label: 'Jogo: Brasil x Marrocos' },
    { time: '20h', label: 'Intervalo e Hambúrguer' },
    { time: '21h', label: 'Banda: Tõ Contigo' },
    { time: '22h', label: 'Jogo: Haiti x Escócia' },
    { time: '23h', label: 'After' },
  ],
};

const DEVICE_KEY = 'paje-leticia-device-id';
const NAME_KEY = 'paje-leticia-guest-name';
const REACTION_OPTIONS = [
  { id: 'amei', label: 'Amei', symbol: '💛' },
  { id: 'gol', label: 'Gol', symbol: '⚽' },
  { id: 'festa', label: 'Festa', symbol: '🎉' },
  { id: 'uau', label: 'Uau', symbol: '😍' },
  { id: 'energia', label: 'Energia', symbol: '🔥' },
  { id: 'aplauso', label: 'Aplauso', symbol: '👏' },
];

function getDeviceId() {
  const existing = localStorage.getItem(DEVICE_KEY);

  if (existing) {
    return existing;
  }

  const id = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  localStorage.setItem(DEVICE_KEY, id);
  return id;
}

function usePath() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = (nextPath) => {
    window.history.pushState({}, '', nextPath);
    setPath(nextPath);
  };

  return [path, navigate];
}

async function fetchPhotos(options = {}) {
  const params = new URLSearchParams();

  if (options.status) params.set('status', options.status);
  if (options.deviceId) params.set('deviceId', options.deviceId);
  if (options.includeMinePending) params.set('includeMinePending', 'true');

  const query = params.toString();
  const response = await fetch(`/api/photos${query ? `?${query}` : ''}`);

  if (!response.ok) {
    throw new Error('Não foi possível carregar as mídias.');
  }

  const data = await response.json();
  return data.photos || [];
}

async function requestJson(url, options) {
  const response = await fetch(url, {
    headers: options?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...options,
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || 'Não foi possível completar a ação.');
  }

  return data;
}

function formatDateTime(value) {
  if (!value) {
    return 'sem horário';
  }

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return 'horário inválido';
  }

  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getStatusLabel(status) {
  const labels = {
    available: 'Disponível agora',
    scheduled: 'Programado',
    expired: 'Encerrado',
    paused: 'Pausado',
  };

  return labels[status] || 'Indefinido';
}

function getStatusIcon(status) {
  if (status === 'available') return CheckCircle2;
  if (status === 'scheduled') return Hourglass;
  if (status === 'expired') return TimerOff;
  return PauseCircle;
}

function getMediaType(item) {
  if (item?.mediaType === 'video' || item?.mimetype?.startsWith('video/')) {
    return 'video';
  }

  return 'image';
}

function getModerationStatus(item) {
  return item?.moderationStatus || 'approved';
}

function getModerationLabel(status) {
  const labels = {
    pending: 'Em revisão',
    approved: 'Aprovada',
    rejected: 'Reprovada',
  };

  return labels[status] || 'Aprovada';
}

function formatPhotoDate(value) {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function MediaPreview({ item, className = '', controls = false, autoPlay = false }) {
  if (!item?.url) {
    return null;
  }

  if (getMediaType(item) === 'video') {
    return (
      <video
        autoPlay={autoPlay}
        className={className}
        controls={controls}
        loop={autoPlay}
        muted
        playsInline
        src={item.url}
      />
    );
  }

  return <img alt={`Mídia enviada por ${item.guestName || 'convidado'}`} className={className} src={item.url} />;
}

function ReactionBadges({ reactions = [] }) {
  if (!reactions.length) {
    return null;
  }

  return (
    <div className="reaction-badges">
      {reactions.map((reaction) => (
        <span key={reaction.id}>
          <strong>{reaction.symbol}</strong>
          {reaction.count ? reaction.count : reaction.label}
        </span>
      ))}
    </div>
  );
}

function MediaStatusPill({ status }) {
  const normalized = status || 'approved';
  const Icon = normalized === 'approved' ? ShieldCheck : normalized === 'rejected' ? XCircle : Clock3;

  return (
    <span className={`media-status ${normalized}`}>
      <Icon size={14} />
      {getModerationLabel(normalized)}
    </span>
  );
}

function GalleryTile({ photo, onOpen, compact = false }) {
  const status = getModerationStatus(photo);

  return (
    <button className={compact ? 'gallery-tile compact' : 'gallery-tile'} onClick={() => onOpen(photo)} type="button">
      <MediaPreview item={photo} />
      {getMediaType(photo) === 'video' ? <span className="media-kind">Vídeo</span> : null}
      {status !== 'approved' ? <MediaStatusPill status={status} /> : null}
      <span className="gallery-tile-gradient" />
      <span className="gallery-tile-meta">
        <strong>{photo.guestName}</strong>
        {photo.reactions?.length ? <ReactionBadges reactions={photo.reactions} /> : null}
      </span>
    </button>
  );
}

function MediaLightbox({
  photo,
  onClose,
  onReact,
  deviceId,
  onPrevious,
  onNext,
  hasPrevious = false,
  hasNext = false,
}) {
  if (!photo) {
    return null;
  }

  const status = getModerationStatus(photo);
  const myVote = photo.reactionVotes?.find((vote) => vote.deviceId === deviceId);
  const canReact = status === 'approved';

  return (
    <div className="media-lightbox" role="dialog" aria-modal="true" aria-label="Mídia da festa">
      <article className="lightbox-card story-viewer">
        <div className="story-progress" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="story-header">
          <div>
            <strong>{photo.guestName}</strong>
            <span>{formatPhotoDate(photo.createdAt)}</span>
          </div>
          <button className="lightbox-close" onClick={onClose} type="button" aria-label="Fechar mídia">
            <X size={22} />
          </button>
        </div>
        <div className="lightbox-media">
          <MediaPreview item={photo} controls={getMediaType(photo) === 'video'} autoPlay={getMediaType(photo) === 'video'} />
        </div>
        {hasPrevious ? (
          <button className="story-tap-zone previous" onClick={onPrevious} type="button" aria-label="Mídia anterior">
            <ChevronLeft size={28} />
          </button>
        ) : null}
        {hasNext ? (
          <button className="story-tap-zone next" onClick={onNext} type="button" aria-label="Próxima mídia">
            <ChevronRight size={28} />
          </button>
        ) : null}
        {status !== 'approved' ? <MediaStatusPill status={status} /> : null}
        {photo.challenge?.title ? (
          <p className="lightbox-challenge">
            <ListChecks size={16} />
            {photo.challenge.title}
          </p>
        ) : null}
        {photo.reactions?.length ? <ReactionBadges reactions={photo.reactions} /> : null}
        <div className="reaction-bar" aria-label="Reagir à mídia">
          {REACTION_OPTIONS.map((reaction) => (
            <button
              className={myVote?.id === reaction.id ? 'reaction-chip active' : 'reaction-chip'}
              disabled={!canReact}
              key={reaction.id}
              onClick={() => onReact(photo.id, reaction)}
              type="button"
              aria-label={`Reagir com ${reaction.label}`}
            >
              <strong>{reaction.symbol}</strong>
            </button>
          ))}
        </div>
        {!canReact ? (
          <p className="lightbox-note">Essa mídia só recebe reações depois de aprovada pela auditoria.</p>
        ) : null}
      </article>
    </div>
  );
}

function App() {
  const [path, navigate] = usePath();

  return (
    <main className={path === '/guest' ? 'app-shell guest-app-shell' : 'app-shell'}>
      {path !== '/guest' && <DecorativeFlags />}
      {path !== '/wall' && path !== '/guest' && <TopNav navigate={navigate} activePath={path} />}
      {path === '/guest' ? <GuestPage /> : null}
      {path === '/wall' ? <WallPage /> : null}
      {path === '/album' ? <AlbumPage /> : null}
      {path === '/control' ? <ControlPage /> : null}
      {path !== '/guest' && path !== '/wall' && path !== '/album' && path !== '/control' ? <QrPage navigate={navigate} /> : null}
    </main>
  );
}

function TopNav({ navigate, activePath }) {
  const links = [
    { path: '/', label: 'QR', icon: QrCode },
    { path: '/guest', label: 'Enviar', icon: Camera },
    { path: '/album', label: 'Álbum', icon: Images },
    { path: '/wall', label: 'Telão', icon: MonitorPlay },
    { path: '/control', label: 'Controle', icon: SlidersHorizontal },
  ];

  return (
    <header className="top-nav">
      <button className="brand-mark" onClick={() => navigate('/')} type="button">
        <span>BR</span>
      </button>
      <nav aria-label="Navegação principal">
        {links.map((link) => {
          const Icon = link.icon;
          const active = link.path === activePath || (link.path === '/' && activePath === '');
          return (
            <button
              className={active ? 'nav-link active' : 'nav-link'}
              key={link.path}
              onClick={() => navigate(link.path)}
              type="button"
            >
              <Icon size={18} />
              <span>{link.label}</span>
            </button>
          );
        })}
      </nav>
    </header>
  );
}

function QrPage({ navigate }) {
  const [network, setNetwork] = useState(null);
  const [manualUrl, setManualUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/api/network')
      .then((response) => response.json())
      .then((data) => {
        const recommended = data.urls?.[0]?.guestUrl || data.fallback?.guestUrl || `${window.location.origin}/guest`;
        setNetwork(data);
        setManualUrl(recommended);
      })
      .catch(() => {
        setManualUrl(`${window.location.origin}/guest`);
      });
  }, []);

  const qrUrl = manualUrl || `${window.location.origin}/guest`;
  const wallUrl =
    network?.urls?.[0]?.wallUrl || network?.fallback?.wallUrl || `${window.location.origin}/wall`;

  const copyQrUrl = async () => {
    await navigator.clipboard?.writeText(qrUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const shareQrUrl = async () => {
    if (navigator.share) {
      await navigator.share({
        title: EVENT.name,
        text: 'Envie suas fotos ou vídeos para o telão da festa.',
        url: qrUrl,
      });
    } else {
      copyQrUrl();
    }
  };

  return (
    <section className="qr-layout page-section">
      <div className="hero-copy">
        <p className="eyebrow">
          <Sparkles size={17} />
          {EVENT.tagline}
        </p>
        <h1>{EVENT.name}</h1>
        <p className="lead">
          Escaneie o QR Code, coloque seu nome uma vez e envie fotos ou vídeos para aparecerem no telão da festa.
        </p>
        <div className="match-ribbon" aria-label="Contexto do jogo do Brasil">
          <Trophy size={20} />
          <strong>{EVENT.match}</strong>
          <span>{EVENT.date}</span>
          <span>{EVENT.time}</span>
        </div>
        <div className="quick-actions">
          <button className="primary-action" onClick={() => navigate('/guest')} type="button">
            <ImageUp size={20} />
            Testar envio
          </button>
          <button className="secondary-action" onClick={() => navigate('/wall')} type="button">
            <MonitorPlay size={20} />
            Abrir telão
          </button>
        </div>
      </div>

      <aside className="qr-panel" aria-label="QR Code para envio de fotos">
        <div className="qr-frame">
          {qrUrl ? (
            <img alt="QR Code para enviar fotos" src={`/api/qr?data=${encodeURIComponent(qrUrl)}`} />
          ) : (
            <RefreshCw className="spin" size={44} />
          )}
        </div>
        <label className="url-control">
          <span>Endereço para o celular</span>
          <input
            onChange={(event) => setManualUrl(event.target.value)}
            value={qrUrl}
            spellCheck="false"
          />
        </label>
        <div className="qr-actions">
          <button className="icon-button" onClick={copyQrUrl} title="Copiar link" type="button">
            {copied ? <CheckCircle2 size={20} /> : <Copy size={20} />}
          </button>
          <button className="icon-button" onClick={shareQrUrl} title="Compartilhar link" type="button">
            <Share2 size={20} />
          </button>
          <a className="link-pill" href={wallUrl}>
            <MonitorPlay size={18} />
            Telão
          </a>
        </div>
        <p className="tiny-note">
          Celular e computador precisam estar na mesma rede Wi-Fi quando estiver rodando localmente.
        </p>
      </aside>
    </section>
  );
}

function GuestPage() {
  const [deviceId] = useState(() => getDeviceId());
  const [guestName, setGuestName] = useState(() => localStorage.getItem(NAME_KEY) || '');
  const [draftName, setDraftName] = useState(() => localStorage.getItem(NAME_KEY) || '');
  const [photos, setPhotos] = useState([]);
  const [guestFilter, setGuestFilter] = useState('all');
  const [activeMedia, setActiveMedia] = useState(null);
  const [challenge, setChallenge] = useState(null);
  const [checklist, setChecklist] = useState([]);
  const [completedChallenges, setCompletedChallenges] = useState(0);
  const [availableChallenges, setAvailableChallenges] = useState(0);
  const [challengeMessage, setChallengeMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const approvedPhotos = useMemo(
    () => photos.filter((photo) => getModerationStatus(photo) === 'approved'),
    [photos],
  );
  const myPhotos = useMemo(
    () => photos.filter((photo) => photo.deviceId === deviceId),
    [deviceId, photos],
  );
  const pendingMine = useMemo(
    () => myPhotos.filter((photo) => getModerationStatus(photo) === 'pending'),
    [myPhotos],
  );
  const guestCount = useMemo(
    () => new Set(approvedPhotos.map((photo) => photo.deviceId).filter(Boolean)).size,
    [approvedPhotos],
  );
  const visibleGuestPhotos = useMemo(() => {
    if (guestFilter === 'challenges') return approvedPhotos.filter((photo) => photo.challenge?.id);
    if (guestFilter === 'recap') {
      const recaps = approvedPhotos.filter((photo) => getMediaType(photo) === 'video' || photo.reactions?.length);
      return recaps.length ? recaps : approvedPhotos.slice(0, 6);
    }
    return approvedPhotos;
  }, [approvedPhotos, guestFilter]);
  const lightboxItems = visibleGuestPhotos.length ? visibleGuestPhotos : approvedPhotos;
  const activeMediaIndex = activeMedia
    ? lightboxItems.findIndex((photo) => photo.id === activeMedia.id)
    : -1;

  const loadPhotos = async () => {
    try {
      setPhotos(await fetchPhotos({ deviceId, includeMinePending: true }));
    } catch (error) {
      setMessage(error.message);
    }
  };

  const loadChallenge = async (forceNew = false) => {
    setChallengeMessage(forceNew ? 'Sorteando outro desafio...' : 'Buscando seu desafio...');

    try {
      const data = await requestJson('/api/challenges/assignment', {
        method: 'POST',
        body: JSON.stringify({
          deviceId,
          guestName: guestName || draftName,
          forceNew,
        }),
      });

      setChallenge(data.challenge);
      setAvailableChallenges(data.availableCount || 0);
      setChallengeMessage(data.challenge ? '' : 'Nenhum desafio disponível neste horário.');
    } catch (error) {
      setChallengeMessage(error.message);
    }
  };

  const loadChecklist = async () => {
    try {
      const data = await requestJson(`/api/challenges/progress?deviceId=${encodeURIComponent(deviceId)}`);
      setChecklist(data.checklist || []);
      setCompletedChallenges(data.completed || 0);
    } catch (error) {
      setChallengeMessage(error.message);
    }
  };

  useEffect(() => {
    loadPhotos();
    loadChecklist();
    const timer = window.setInterval(loadPhotos, 5000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    loadChallenge();
  }, []);

  const saveName = (event) => {
    event.preventDefault();
    const cleanName = draftName.trim();

    if (!cleanName) {
      setMessage('Me diz seu nome para aparecer bonito no telão.');
      return;
    }

    localStorage.setItem(NAME_KEY, cleanName);
    setGuestName(cleanName);
    setMessage('Nome salvo para os próximos envios.');
    loadChallenge();
  };

  const uploadFiles = async (files) => {
    if (!guestName) {
      setMessage('Salve seu nome antes de enviar fotos ou vídeos.');
      return;
    }

    const selectedFiles = Array.from(files || []).filter(
      (file) => file.type.startsWith('image/') || file.type.startsWith('video/'),
    );

    if (!selectedFiles.length) {
      setMessage('Escolha pelo menos uma foto ou vídeo.');
      return;
    }

    setUploading(true);
    setMessage('Enviando suas mídias...');

    try {
      for (const file of selectedFiles) {
        const formData = new FormData();
        formData.append('photo', file);
        formData.append('guestName', guestName);
        formData.append('deviceId', deviceId);
        if (challenge?.id) {
          formData.append('challengeId', challenge.id);
        }

        const response = await fetch('/api/photos', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || 'Não foi possível enviar uma das mídias.');
        }
      }

      setMessage(
        selectedFiles.length === 1
          ? 'Mídia recebida. Ela aparece no álbum quando for aprovada.'
          : 'Mídias recebidas. Elas aparecem no álbum quando forem aprovadas.',
      );
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      await loadPhotos();
      await loadChecklist();
      if (challenge?.id) {
        await loadChallenge(true);
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setUploading(false);
    }
  };

  const reactToMedia = async (photoId, reaction) => {
    try {
      const data = await requestJson(`/api/photos/${photoId}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ deviceId, reaction }),
      });

      setPhotos((current) => current.map((photo) => (photo.id === data.photo.id ? data.photo : photo)));
      setActiveMedia((current) => (current?.id === data.photo.id ? data.photo : current));
    } catch (error) {
      setMessage(error.message);
    }
  };

  const moveActiveMedia = (step) => {
    if (!lightboxItems.length) {
      return;
    }

    const currentIndex = activeMediaIndex >= 0 ? activeMediaIndex : 0;
    const nextIndex = (currentIndex + step + lightboxItems.length) % lightboxItems.length;
    setActiveMedia(lightboxItems[nextIndex]);
  };

  return (
    <section className="guest-home page-section">
      <input
        accept="image/*,video/*"
        className="hidden-input"
        multiple
        onChange={(event) => uploadFiles(event.target.files)}
        ref={fileInputRef}
        type="file"
      />
      <input
        accept="image/*,video/*"
        capture="environment"
        className="hidden-input"
        onChange={(event) => uploadFiles(event.target.files)}
        ref={cameraInputRef}
        type="file"
      />

      <section className="event-memory-card" aria-label="Página inicial da festa">
        <div className="event-hero-media has-media">
          <img alt="Arte Brasilidade da festa" src={EVENT.coverUrl} />
          <div className="event-countdown" aria-label="Data da festa">
            <span>Letícia e Pajé convidam</span>
            <strong>13 06 26</strong>
            <small>Dia · Mês · Ano</small>
          </div>
        </div>

        <div className="event-info-panel">
          <span className="event-soft-label">{approvedPhotos.length || 0} memórias no álbum</span>
          <h1>{EVENT.shortName}</h1>
          <p>{EVENT.guestProgram.time} · {EVENT.guestProgram.label}</p>
        </div>
      </section>

      <form className="guest-name-inline" onSubmit={saveName}>
        <UserRound size={21} />
        <input
          onChange={(event) => setDraftName(event.target.value)}
          placeholder="Seu nome"
          value={draftName}
        />
        <button title="Salvar nome" type="submit">
          <CheckCircle2 size={18} />
        </button>
      </form>

      <nav className="memory-modes" aria-label="Áreas da festa">
        <button
          className={guestFilter === 'all' ? 'memory-mode active' : 'memory-mode'}
          onClick={() => setGuestFilter('all')}
          type="button"
        >
          <Images size={19} />
          <span>Memories</span>
        </button>
        <button
          className={guestFilter === 'challenges' ? 'memory-mode active' : 'memory-mode'}
          onClick={() => setGuestFilter('challenges')}
          type="button"
        >
          <ListChecks size={19} />
          <span>Desafios</span>
        </button>
        <button
          className={guestFilter === 'recap' ? 'memory-mode active' : 'memory-mode'}
          onClick={() => setGuestFilter('recap')}
          type="button"
        >
          <PlayCircle size={19} />
          <span>Recap</span>
        </button>
        <button className="memory-mode stat" onClick={() => setGuestFilter('all')} type="button">
          <Users size={19} />
          <strong>{guestCount}</strong>
          <span>Convid.</span>
        </button>
      </nav>

      {guestFilter === 'challenges' ? (
        <section className="mission-preview" aria-label="Desafio fotográfico">
          <div>
            <p className="eyebrow">
              <ListChecks size={16} />
              Desafio da vez
            </p>
            <h2>{challenge?.title || 'Desafio sendo preparado'}</h2>
            <span>{challenge?.description || challengeMessage || 'Quando houver desafio disponível, ele aparece aqui.'}</span>
          </div>
          <button
            className="icon-button"
            onClick={() => loadChallenge(true)}
            title="Sortear outro desafio"
            type="button"
          >
            <Shuffle size={19} />
          </button>
          <footer>
            <span>{challenge?.category || 'Aguardando'}</span>
            <span>{completedChallenges}/{checklist.length || availableChallenges}</span>
          </footer>
        </section>
      ) : null}

      <section className="social-gallery phone-gallery" aria-label="Galeria compartilhada">
        <div className="phone-gallery-heading">
          <h2>
            {guestFilter === 'challenges'
              ? 'Fotos ou vídeos dos desafios'
              : guestFilter === 'recap'
                ? 'Recaps da festa'
                : 'Fotos e vídeos que postaram'}
          </h2>
          <button className="icon-button" onClick={loadPhotos} title="Atualizar galeria" type="button">
            <RefreshCw size={18} />
          </button>
        </div>

        {visibleGuestPhotos.length ? (
          <div className="social-gallery-grid">
            {visibleGuestPhotos.map((photo, index) => (
              <GalleryTile
                compact={index === 1}
                key={photo.id}
                photo={photo}
                onOpen={setActiveMedia}
              />
            ))}
          </div>
        ) : (
          <button className="empty-gallery social-empty" onClick={() => fileInputRef.current?.click()} type="button">
            <ImageUp size={30} />
            <span>{guestFilter === 'pending' ? 'Nenhuma mídia sua em revisão' : 'Seja a primeira pessoa a postar'}</span>
          </button>
        )}
      </section>

      {pendingMine.length ? (
        <section className="pending-strip" aria-label="Mídias aguardando revisão">
          <div>
            <Clock3 size={17} />
            <strong>{pendingMine.length} em revisão</strong>
          </div>
          <div className="pending-thumbs">
            {pendingMine.slice(0, 4).map((photo) => (
              <GalleryTile compact key={photo.id} photo={photo} onOpen={setActiveMedia} />
            ))}
          </div>
        </section>
      ) : null}

      {message ? <p className="guest-status-note">{message}</p> : null}

      <button
        className="upload-fab"
        disabled={uploading}
        onClick={() => fileInputRef.current?.click()}
        type="button"
      >
        {uploading ? <RefreshCw className="spin" size={18} /> : <UploadCloud size={18} />}
        Upload
      </button>

      <MediaLightbox
        deviceId={deviceId}
        hasNext={lightboxItems.length > 1}
        hasPrevious={lightboxItems.length > 1}
        onClose={() => setActiveMedia(null)}
        onNext={() => moveActiveMedia(1)}
        onPrevious={() => moveActiveMedia(-1)}
        onReact={reactToMedia}
        photo={activeMedia}
      />
    </section>
  );
}

function WallPage() {
  const [photos, setPhotos] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const guestUrl = `${window.location.origin}/guest`;

  useEffect(() => {
    const load = async () => {
      try {
        setPhotos(await fetchPhotos());
      } catch {
        setPhotos([]);
      }
    };

    load();
    const timer = window.setInterval(load, 4000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!photos.length) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % photos.length);
    }, 6500);

    return () => window.clearInterval(timer);
  }, [photos.length]);

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(photos.length - 1, 0)));
  }, [photos.length]);

  const activePhoto = photos[activeIndex];
  const recentPhotos = photos.slice(0, 8);
  const guestCount = new Set(photos.map((photo) => photo.deviceId)).size;

  return (
    <section className="wall-screen">
      <div className="wall-stage">
        {activePhoto ? (
          <>
            <MediaPreview
              autoPlay
              className="wall-photo-bg"
              key={`${activePhoto.id}-bg`}
              item={activePhoto}
            />
            <div className="wall-photo-frame">
              <MediaPreview
                autoPlay
                className="wall-photo"
                key={activePhoto.id}
                item={activePhoto}
              />
            </div>
          </>
        ) : (
          <div className="wall-empty">
            <QrCode size={74} />
            <h1>Escaneie e mande sua mídia</h1>
            <p>As mídias aprovadas aparecem aqui durante a festa.</p>
          </div>
        )}
      </div>

      <div className="wall-topbar">
        <div>
          <p>{EVENT.tagline}</p>
          <h1>{EVENT.name}</h1>
        </div>
        <div className="wall-score">
          <strong>{photos.length}</strong>
          <span>mídias</span>
        </div>
        <div className="wall-score">
          <strong>{guestCount}</strong>
          <span>{guestCount === 1 ? 'pessoa' : 'pessoas'}</span>
        </div>
      </div>

      <aside className="wall-live-panel" aria-label="Resumo ao vivo">
        <span>Ao vivo</span>
        <strong>{photos.length}</strong>
        <div>
          <b>{guestCount}</b>
          {guestCount === 1 ? 'pessoa participando' : 'pessoas participando'}
        </div>
        <div className="wall-author">
          <small>Agora no telão</small>
          <h2>{activePhoto?.guestName || 'Esperando a primeira mídia'}</h2>
          <ReactionBadges reactions={activePhoto?.reactions} />
        </div>
      </aside>

      <aside className="wall-program" aria-label="Programação da festa">
        <strong>Programação</strong>
        {EVENT.fullProgram.map((item) => (
          <span key={`${item.time}-${item.label}`}>
            <b>{item.time}</b>
            {item.label}
          </span>
        ))}
      </aside>

      <aside className="wall-qr">
        <img alt="QR Code para participar" src={`/api/qr?data=${encodeURIComponent(guestUrl)}`} />
        <span>Enviar mídia</span>
      </aside>

      {recentPhotos.length ? (
        <div className="wall-strip">
          {recentPhotos.map((photo) => (
            <MediaPreview
              className={photo.id === activePhoto?.id ? 'active' : ''}
              item={photo}
              key={photo.id}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function AlbumPage() {
  const [deviceId] = useState(() => getDeviceId());
  const [photos, setPhotos] = useState([]);
  const [filter, setFilter] = useState('all');
  const [activeMedia, setActiveMedia] = useState(null);
  const [albumMessage, setAlbumMessage] = useState('');

  const loadAlbum = async () => {
    try {
      setPhotos(await fetchPhotos());
      setAlbumMessage('');
    } catch (error) {
      setAlbumMessage(error.message);
    }
  };

  useEffect(() => {
    loadAlbum();
    const timer = window.setInterval(loadAlbum, 6000);
    return () => window.clearInterval(timer);
  }, []);

  const reactToMedia = async (photoId, reaction) => {
    try {
      const data = await requestJson(`/api/photos/${photoId}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ deviceId, reaction }),
      });

      setPhotos((current) => current.map((photo) => (photo.id === data.photo.id ? data.photo : photo)));
      setActiveMedia((current) => (current?.id === data.photo.id ? data.photo : current));
    } catch (error) {
      setAlbumMessage(error.message);
    }
  };

  const filteredPhotos = photos.filter((photo) => {
    if (filter === 'mine') return photo.deviceId === deviceId;
    if (filter === 'images') return getMediaType(photo) === 'image';
    if (filter === 'videos') return getMediaType(photo) === 'video';
    if (filter === 'challenges') return Boolean(photo.challenge?.id);
    return true;
  });
  const challengeCount = photos.filter((photo) => photo.challenge?.id).length;
  const videoCount = photos.filter((photo) => getMediaType(photo) === 'video').length;
  const activeAlbumIndex = activeMedia
    ? filteredPhotos.findIndex((photo) => photo.id === activeMedia.id)
    : -1;
  const moveAlbumMedia = (step) => {
    if (!filteredPhotos.length) {
      return;
    }

    const currentIndex = activeAlbumIndex >= 0 ? activeAlbumIndex : 0;
    const nextIndex = (currentIndex + step + filteredPhotos.length) % filteredPhotos.length;
    setActiveMedia(filteredPhotos[nextIndex]);
  };

  return (
    <section className="album-page page-section">
      <div className="control-hero">
        <p className="eyebrow">
          <Images size={17} />
          Álbum compartilhado
        </p>
        <h1>As memórias da festa em um só lugar.</h1>
        <p className="lead">
          Fotos, vídeos, desafios concluídos e reações aparecem aqui para todo mundo acompanhar durante a festa.
        </p>
      </div>

      <div className="control-summary">
        <MetricCard label="mídias" value={photos.length} />
        <MetricCard label="desafios" value={challengeCount} />
        <MetricCard label="vídeos" value={videoCount} />
        <MetricCard label="pessoas" value={new Set(photos.map((photo) => photo.deviceId)).size} />
      </div>

      <div className="control-toolbar">
        <div className="category-tabs" role="tablist" aria-label="Filtros do álbum">
          {[
            ['all', 'Tudo'],
            ['mine', 'Minhas'],
            ['images', 'Fotos'],
            ['videos', 'Vídeos'],
            ['challenges', 'Com desafios'],
          ].map(([value, label]) => (
            <button
              className={filter === value ? 'category-tab active' : 'category-tab'}
              key={value}
              onClick={() => setFilter(value)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        <button className="secondary-action" onClick={loadAlbum} type="button">
          <RefreshCw size={18} />
          Atualizar
        </button>
      </div>

      {albumMessage ? <div className="control-message">{albumMessage}</div> : null}

      {filteredPhotos.length ? (
        <div className="album-grid">
          {filteredPhotos.map((photo) => (
            <GalleryTile key={photo.id} photo={photo} onOpen={setActiveMedia} />
          ))}
        </div>
      ) : (
        <div className="album-empty">
          <Images size={38} />
          <strong>Nada por aqui ainda</strong>
          <span>Assim que os convidados enviarem, o álbum começa a ganhar vida.</span>
        </div>
      )}
      <MediaLightbox
        deviceId={deviceId}
        hasNext={filteredPhotos.length > 1}
        hasPrevious={filteredPhotos.length > 1}
        onClose={() => setActiveMedia(null)}
        onNext={() => moveAlbumMedia(1)}
        onPrevious={() => moveAlbumMedia(-1)}
        onReact={reactToMedia}
        photo={activeMedia}
      />
    </section>
  );
}

function ControlPage() {
  const emptyDraft = {
    title: '',
    description: '',
    category: 'Geral',
    active: true,
    startsAt: '',
    endsAt: '',
  };
  const [deviceId] = useState(() => getDeviceId());
  const [controlMode, setControlMode] = useState('audit');
  const [auditFilter, setAuditFilter] = useState('pending');
  const [moderationPhotos, setModerationPhotos] = useState([]);
  const [activeAuditMedia, setActiveAuditMedia] = useState(null);
  const [challenges, setChallenges] = useState([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [filter, setFilter] = useState('todos');
  const [savingId, setSavingId] = useState('');
  const [controlMessage, setControlMessage] = useState('');

  const loadChallenges = async () => {
    try {
      const data = await requestJson('/api/challenges');
      setChallenges(data.challenges || []);
    } catch (error) {
      setControlMessage(error.message);
    }
  };

  const loadModeration = async () => {
    try {
      setModerationPhotos(await fetchPhotos({ status: 'all' }));
    } catch (error) {
      setControlMessage(error.message);
    }
  };

  useEffect(() => {
    loadChallenges();
    loadModeration();
    const timer = window.setInterval(() => {
      loadChallenges();
      loadModeration();
    }, 15000);
    return () => window.clearInterval(timer);
  }, []);

  const categories = useMemo(
    () => ['todos', ...Array.from(new Set(challenges.map((challenge) => challenge.category))).sort()],
    [challenges],
  );
  const summary = useMemo(
    () => ({
      total: challenges.length,
      available: challenges.filter((challenge) => challenge.status === 'available').length,
      scheduled: challenges.filter((challenge) => challenge.status === 'scheduled').length,
      paused: challenges.filter((challenge) => challenge.status === 'paused').length,
    }),
    [challenges],
  );
  const visibleChallenges = challenges.filter(
    (challenge) => filter === 'todos' || challenge.category === filter || challenge.status === filter,
  );
  const moderationSummary = useMemo(
    () => ({
      total: moderationPhotos.length,
      pending: moderationPhotos.filter((photo) => getModerationStatus(photo) === 'pending').length,
      approved: moderationPhotos.filter((photo) => getModerationStatus(photo) === 'approved').length,
      rejected: moderationPhotos.filter((photo) => getModerationStatus(photo) === 'rejected').length,
    }),
    [moderationPhotos],
  );
  const visibleModerationPhotos = moderationPhotos.filter(
    (photo) => auditFilter === 'all' || getModerationStatus(photo) === auditFilter,
  );

  const updateChallengeField = (id, field, value) => {
    setChallenges((current) =>
      current.map((challenge) => (challenge.id === id ? { ...challenge, [field]: value } : challenge)),
    );
  };

  const saveChallenge = async (challenge) => {
    setSavingId(challenge.id);
    setControlMessage('');

    try {
      const data = await requestJson(`/api/challenges/${challenge.id}`, {
        method: 'PUT',
        body: JSON.stringify(challenge),
      });

      setChallenges((current) =>
        current.map((item) => (item.id === challenge.id ? data.challenge : item)),
      );
      setControlMessage('Desafio salvo.');
    } catch (error) {
      setControlMessage(error.message);
    } finally {
      setSavingId('');
    }
  };

  const createChallenge = async (event) => {
    event.preventDefault();
    setSavingId('new');
    setControlMessage('');

    try {
      const data = await requestJson('/api/challenges', {
        method: 'POST',
        body: JSON.stringify(draft),
      });

      setChallenges((current) => [data.challenge, ...current]);
      setDraft(emptyDraft);
      setControlMessage('Novo desafio criado.');
    } catch (error) {
      setControlMessage(error.message);
    } finally {
      setSavingId('');
    }
  };

  const moderatePhoto = async (photoId, moderationStatus) => {
    setSavingId(photoId);
    setControlMessage('');

    try {
      const data = await requestJson(`/api/photos/${photoId}/moderation`, {
        method: 'PUT',
        body: JSON.stringify({ moderationStatus }),
      });

      setModerationPhotos((current) =>
        current.map((photo) => (photo.id === data.photo.id ? data.photo : photo)),
      );
      setActiveAuditMedia((current) => (current?.id === data.photo.id ? data.photo : current));
      setControlMessage(moderationStatus === 'approved' ? 'Mídia aprovada.' : 'Mídia reprovada.');
    } catch (error) {
      setControlMessage(error.message);
    } finally {
      setSavingId('');
    }
  };

  return (
    <section className="control-page page-section">
      <div className="control-hero">
        <p className="eyebrow">
          <SlidersHorizontal size={17} />
          Controle da festa
        </p>
        <h1>Auditoria das mídias e missões por momento.</h1>
        <p className="lead">
          Aprove o que aparece no telão e programe desafios para liberar missões quando banda, DJ, painel ou parabéns estiverem prontos.
        </p>
      </div>

      <div className="control-mode-tabs" role="tablist" aria-label="Áreas de controle">
        <button
          className={controlMode === 'audit' ? 'control-mode active' : 'control-mode'}
          onClick={() => setControlMode('audit')}
          type="button"
        >
          <ShieldAlert size={18} />
          Auditoria
        </button>
        <button
          className={controlMode === 'challenges' ? 'control-mode active' : 'control-mode'}
          onClick={() => setControlMode('challenges')}
          type="button"
        >
          <ListChecks size={18} />
          Desafios
        </button>
      </div>

      {controlMessage ? <div className="control-message">{controlMessage}</div> : null}

      {controlMode === 'audit' ? (
        <>
          <div className="control-summary">
            <MetricCard label="mídias" value={moderationSummary.total} />
            <MetricCard label="em revisão" value={moderationSummary.pending} />
            <MetricCard label="aprovadas" value={moderationSummary.approved} />
            <MetricCard label="reprovadas" value={moderationSummary.rejected} />
          </div>

          <div className="control-toolbar">
            <div className="category-tabs" role="tablist" aria-label="Filtros da auditoria">
              {[
                ['pending', 'Em revisão'],
                ['approved', 'Aprovadas'],
                ['rejected', 'Reprovadas'],
                ['all', 'Todas'],
              ].map(([value, label]) => (
                <button
                  className={auditFilter === value ? 'category-tab active' : 'category-tab'}
                  key={value}
                  onClick={() => setAuditFilter(value)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
            <button className="secondary-action" onClick={loadModeration} type="button">
              <RefreshCw size={18} />
              Atualizar
            </button>
          </div>

          {visibleModerationPhotos.length ? (
            <div className="audit-grid">
              {visibleModerationPhotos.map((photo) => (
                <article className="audit-card" key={photo.id}>
                  <button className="audit-thumb" onClick={() => setActiveAuditMedia(photo)} type="button">
                    <MediaPreview item={photo} />
                    <span>
                      <Eye size={17} />
                      Abrir
                    </span>
                  </button>
                  <div className="audit-body">
                    <MediaStatusPill status={getModerationStatus(photo)} />
                    <strong>{photo.guestName}</strong>
                    <span>{formatPhotoDate(photo.createdAt)}</span>
                    {photo.challenge?.title ? (
                      <p>
                        <ListChecks size={15} />
                        {photo.challenge.title}
                      </p>
                    ) : null}
                    <ReactionBadges reactions={photo.reactions} />
                  </div>
                  <div className="audit-actions">
                    <button
                      className="secondary-action danger"
                      disabled={savingId === photo.id}
                      onClick={() => moderatePhoto(photo.id, 'rejected')}
                      type="button"
                    >
                      <XCircle size={18} />
                      Reprovar
                    </button>
                    <button
                      className="primary-action"
                      disabled={savingId === photo.id}
                      onClick={() => moderatePhoto(photo.id, 'approved')}
                      type="button"
                    >
                      <ShieldCheck size={18} />
                      Aprovar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="album-empty">
              <ShieldCheck size={38} />
              <strong>Nada para revisar agora</strong>
              <span>Quando alguém enviar mídia nova, ela aparece primeiro aqui.</span>
            </div>
          )}

          <MediaLightbox
            deviceId={deviceId}
            onClose={() => setActiveAuditMedia(null)}
            onReact={() => {}}
            photo={activeAuditMedia}
          />
        </>
      ) : (
        <>
          <div className="control-summary">
            <MetricCard label="desafios" value={summary.total} />
            <MetricCard label="disponíveis" value={summary.available} />
            <MetricCard label="programados" value={summary.scheduled} />
            <MetricCard label="pausados" value={summary.paused} />
          </div>

          <form className="challenge-create" onSubmit={createChallenge}>
            <div>
              <h2>Novo desafio</h2>
              <p>Crie missões específicas para momentos que ainda vão aparecer na festa.</p>
            </div>
            <input
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
              placeholder="Título do desafio"
              value={draft.title}
            />
            <input
              onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))}
              placeholder="Categoria"
              value={draft.category}
            />
            <input
              onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
              placeholder="Descrição curta"
              value={draft.description}
            />
            <div className="schedule-fields">
              <label>
                <span>Início</span>
                <input
                  onChange={(event) => setDraft((current) => ({ ...current, startsAt: event.target.value }))}
                  type="datetime-local"
                  value={draft.startsAt}
                />
              </label>
              <label>
                <span>Fim</span>
                <input
                  onChange={(event) => setDraft((current) => ({ ...current, endsAt: event.target.value }))}
                  type="datetime-local"
                  value={draft.endsAt}
                />
              </label>
              <button className="primary-action" disabled={savingId === 'new'} type="submit">
                <Plus size={19} />
                Criar
              </button>
            </div>
          </form>

          <div className="control-toolbar">
            <div className="category-tabs" role="tablist" aria-label="Filtros de desafio">
              {categories.map((category) => (
                <button
                  className={filter === category ? 'category-tab active' : 'category-tab'}
                  key={category}
                  onClick={() => setFilter(category)}
                  type="button"
                >
                  {category === 'todos' ? 'Todos' : category}
                </button>
              ))}
              {['available', 'scheduled', 'paused', 'expired'].map((status) => (
                <button
                  className={filter === status ? 'category-tab active' : 'category-tab'}
                  key={status}
                  onClick={() => setFilter(status)}
                  type="button"
                >
                  {getStatusLabel(status)}
                </button>
              ))}
            </div>
            <button className="secondary-action" onClick={loadChallenges} type="button">
              <RefreshCw size={18} />
              Atualizar
            </button>
          </div>

          <div className="challenge-list">
            {visibleChallenges.map((challenge) => {
              const StatusIcon = getStatusIcon(challenge.status);

              return (
                <article className="challenge-row" key={challenge.id}>
                  <div className="challenge-row-main">
                    <div className={`status-pill ${challenge.status}`}>
                      <StatusIcon size={16} />
                      {getStatusLabel(challenge.status)}
                    </div>
                    <label>
                      <span>Título</span>
                      <input
                        onChange={(event) => updateChallengeField(challenge.id, 'title', event.target.value)}
                        value={challenge.title}
                      />
                    </label>
                    <label>
                      <span>Descrição</span>
                      <input
                        onChange={(event) => updateChallengeField(challenge.id, 'description', event.target.value)}
                        value={challenge.description}
                      />
                    </label>
                  </div>
                  <div className="challenge-row-side">
                    <label>
                      <span>Categoria</span>
                      <input
                        onChange={(event) => updateChallengeField(challenge.id, 'category', event.target.value)}
                        value={challenge.category}
                      />
                    </label>
                    <label>
                      <span>Início</span>
                      <input
                        onChange={(event) => updateChallengeField(challenge.id, 'startsAt', event.target.value)}
                        type="datetime-local"
                        value={challenge.startsAt || ''}
                      />
                    </label>
                    <label>
                      <span>Fim</span>
                      <input
                        onChange={(event) => updateChallengeField(challenge.id, 'endsAt', event.target.value)}
                        type="datetime-local"
                        value={challenge.endsAt || ''}
                      />
                    </label>
                    <label className="active-toggle">
                      <input
                        checked={challenge.active}
                        onChange={(event) => updateChallengeField(challenge.id, 'active', event.target.checked)}
                        type="checkbox"
                      />
                      <span>Ativo</span>
                    </label>
                    <button
                      className="primary-action"
                      disabled={savingId === challenge.id}
                      onClick={() => saveChallenge(challenge)}
                      type="button"
                    >
                      <Save size={18} />
                      Salvar
                    </button>
                  </div>
                  <footer className="challenge-row-footer">
                    <CalendarClock size={16} />
                    <span>Início: {formatDateTime(challenge.startsAt)}</span>
                    <span>Fim: {formatDateTime(challenge.endsAt)}</span>
                  </footer>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

function MetricCard({ label, value }) {
  return (
    <div className="metric-card">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function DecorativeFlags() {
  return (
    <div aria-hidden="true" className="decorative-flags">
      <span />
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}

export default App;
