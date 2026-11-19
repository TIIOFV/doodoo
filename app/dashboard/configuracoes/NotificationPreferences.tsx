'use client';
import { useEffect, useState } from 'react';
import { Bell, Keyboard, Monitor, Volume2 } from 'lucide-react';
import {
  getDesktopNotificationPermission,
  readDesktopNotificationEnabled,
  requestDesktopNotificationPermission,
  saveDesktopNotificationEnabled,
  sendTestDesktopNotification,
  type DesktopNotificationPermission,
} from '../../lib/desktopNotifications';
import {
  playPortalSound,
  readSoundPreference,
  saveSoundPreference,
  unlockPortalAudio,
  type SoundPreference,
} from '../../lib/notificationSound';

export default function NotificationPreferences({ userId }: { userId: string }) {
  const [sound, setSound] = useState<SoundPreference>(() => readSoundPreference(userId));
  const [typing, setTyping] = useState(() => {
    try {
      return localStorage.getItem('doodoo:typing:' + userId) !== 'off';
    } catch {
      return true;
    }
  });
  const [desktopEnabled, setDesktopEnabled] = useState(() => readDesktopNotificationEnabled(userId));
  const [desktopPermission, setDesktopPermission] = useState<DesktopNotificationPermission>(() =>
    getDesktopNotificationPermission()
  );
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    const restore = () => {
      setSound(readSoundPreference(userId));
      setDesktopEnabled(readDesktopNotificationEnabled(userId));
      setDesktopPermission(getDesktopNotificationPermission());
      try {
        setTyping(localStorage.getItem('doodoo:typing:' + userId) !== 'off');
      } catch {
        /* Ignore */
      }
    };
    window.addEventListener('storage', restore);
    window.addEventListener('doodoo:desktop_notif_preference', restore);
    return () => {
      window.removeEventListener('storage', restore);
      window.removeEventListener('doodoo:desktop_notif_preference', restore);
    };
  }, [userId]);

  const update = (patch: Partial<SoundPreference>) => {
    const next = { ...sound, ...patch };
    setSound(next);
    try {
      saveSoundPreference(userId, next);
      setFeedback('Preferências salvas neste dispositivo.');
    } catch {
      setFeedback('Não foi possível guardar as preferências neste dispositivo.');
    }
  };

  const handleDesktopToggle = async (checked: boolean) => {
    setDesktopEnabled(checked);
    try {
      saveDesktopNotificationEnabled(userId, checked);
      if (checked && desktopPermission === 'default') {
        const permission = await requestDesktopNotificationPermission();
        setDesktopPermission(permission);
        setFeedback(
          permission === 'granted'
            ? 'Alertas pop-up do Windows ativados neste dispositivo.'
            : 'Permissão de notificação não concedida no navegador.'
        );
      } else {
        setFeedback(checked ? 'Alertas pop-up do Windows ativados.' : 'Alertas pop-up do Windows pausados.');
      }
    } catch {
      setFeedback('Não foi possível salvar esta preferência.');
    }
  };

  const handleRequestPermission = async () => {
    const permission = await requestDesktopNotificationPermission();
    setDesktopPermission(permission);
    if (permission === 'granted') {
      setDesktopEnabled(true);
      try {
        saveDesktopNotificationEnabled(userId, true);
      } catch {
        /* Ignore */
      }
      setFeedback('Permissão concedida! Você já pode testar o pop-up do Windows.');
    } else if (permission === 'denied') {
      setFeedback('Notificações bloqueadas no navegador. Libere na barra de endereço.');
    }
  };

  return (
    <section className="settings-preferences">
      <div className="settings-section-title">
        <span>
          <Monitor size={20} />
        </span>
        <div>
          <h3>Pop-up do Windows</h3>
          <p>Apenas para novas tarefas, mudança de status de tarefas, mensagens no chat e eventos da agenda.</p>
        </div>
      </div>

      <label className="settings-preference-row">
        <span>
          <strong>Ativar pop-up no Windows</strong>
          <small>
            {desktopPermission === 'unsupported'
              ? 'Este navegador não suporta notificações nativas.'
              : desktopPermission === 'denied'
                ? 'Bloqueado no navegador — clique no cadeado da barra de endereço para liberar.'
                : desktopPermission === 'granted'
                  ? 'Permissão liberada neste navegador.'
                  : 'Clique em Permitir para receber alertas na área de trabalho.'}
          </small>
        </span>
        <input
          aria-label="Ativar pop-up no Windows"
          type="checkbox"
          checked={desktopEnabled}
          disabled={desktopPermission === 'unsupported'}
          onChange={(e) => void handleDesktopToggle(e.target.checked)}
        />
      </label>

      {desktopPermission !== 'unsupported' && (
        <div className="settings-sound-controls">
          {desktopPermission !== 'granted' ? (
            <button type="button" onClick={() => void handleRequestPermission()}>
              <Bell size={16} />
              Permitir pop-ups do Windows
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                const ok = sendTestDesktopNotification();
                setFeedback(
                  ok
                    ? 'Pop-up de teste enviado para o Windows.'
                    : 'Não foi possível exibir o pop-up. Verifique o Assistente de Foco do Windows.'
                );
              }}
            >
              <Monitor size={16} />
              Testar pop-up
            </button>
          )}
        </div>
      )}

      <div className="settings-section-title">
        <span>
          <Volume2 size={20} />
        </span>
        <div>
          <h3>Som das notificações</h3>
          <p>Um toque curto e suave, sem repetição contínua.</p>
        </div>
      </div>
      <label className="settings-preference-row">
        <span>
          <strong>Ativar som</strong>
          <small>Para novas mensagens e avisos recebidos no portal.</small>
        </span>
        <input
          aria-label="Ativar som das notificações"
          type="checkbox"
          checked={sound.enabled}
          onChange={(e) => update({ enabled: e.target.checked })}
        />
      </label>
      <div className="settings-sound-controls">
        <label>
          Toque
          <select
            aria-label="Toque de notificação"
            value={sound.tone}
            onChange={(e) => update({ tone: e.target.value as SoundPreference['tone'] })}
          >
            <option value="soft">Suave</option>
            <option value="chime">Cristalino</option>
          </select>
        </label>
        <label>
          Volume · {Math.round(sound.volume * 200)}%
          <input
            aria-label="Volume das notificações"
            type="range"
            min="0"
            max="0.5"
            step="0.025"
            value={sound.volume}
            onChange={(e) => update({ volume: Number(e.target.value) })}
          />
        </label>
        <button
          type="button"
          onClick={async () => {
            await unlockPortalAudio();
            const played = playPortalSound(userId, true);
            setFeedback(played ? 'Toque de teste reproduzido.' : 'Verifique o volume e se o navegador permite áudio.');
          }}
        >
          <Bell size={16} />
          Ouvir toque
        </button>
      </div>

      <div className="settings-section-title">
        <span>
          <Keyboard size={20} />
        </span>
        <div>
          <h3>Indicador de digitação</h3>
          <p>Sem compartilhar o texto que você está escrevendo.</p>
        </div>
      </div>
      <label className="settings-preference-row">
        <span>
          <strong>Mostrar quando estou digitando</strong>
          <small>Visível apenas para participantes da conversa, por alguns segundos.</small>
        </span>
        <input
          aria-label="Mostrar quando estou digitando"
          type="checkbox"
          checked={typing}
          onChange={(e) => {
            setTyping(e.target.checked);
            try {
              localStorage.setItem('doodoo:typing:' + userId, e.target.checked ? 'on' : 'off');
              window.dispatchEvent(new Event('doodoo:typing_preference'));
              setFeedback('Preferência salva neste dispositivo.');
            } catch {
              setFeedback('Não foi possível salvar esta preferência.');
            }
          }}
        />
      </label>
      <p className="settings-local-note">
        Preferências deste navegador. O áudio pode precisar de um toque seu para ser liberado pelo iPhone.
      </p>
      <p role="status" className="settings-preference-feedback">
        {feedback}
      </p>
    </section>
  );
}
