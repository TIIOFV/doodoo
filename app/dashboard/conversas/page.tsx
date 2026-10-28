'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { 
  MessageSquare, Search, Send, Paperclip, Image as ImageIcon, Calendar, 
  Users, UserPlus, Trash2, X, Check, CheckCheck, Palette, FileText, 
  Download, Loader2, AlertTriangle, LogOut, Clock, Reply, Smile, CornerDownRight, Megaphone
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
// 🚀 1. LIGADO AO CÉREBRO GLOBAL DO TEMA
import { useTheme } from '../../contexts/ThemeContext';

type RoleType = 'administrador' | 'gestor' | 'coordenador' | 'supervisor' | 'analista' | 'colaborador';
type UserStatusType = 'online' | 'ausente' | 'ocupado' | 'indisponivel' | 'offline';

interface DBProfile {
  id: string;
  user_id: string;
  nome: string;
  email: string;
  cargo: RoleType;
  setor: string;
  avatar_url?: string;
  status_presenca?: UserStatusType;
  last_seen?: string;
}

interface ReplyInfo {
  id: string;
  sender: string;
  text: string;
}

interface Message {
  id: string;
  canal_id: string;
  sender_id: string;
  sender: string;
  text: string;
  time: string;
  dateLabel: string;
  type: 'text' | 'image' | 'file' | 'event';
  status?: 'sending' | 'sent' | 'error';
  mediaUrl?: string;
  fileName?: string;
  fileSize?: string;
  eventDetails?: { title: string; date: string; time: string; location: string };
  acceptedBy?: string[];
  lidoPor?: string[];
  replyTo?: ReplyInfo;
  created_at: string;
}

interface ChatChannel {
  id: string;
  name: string;
  isGroup: boolean;
  isDirect?: boolean;
  sector?: string;
  foto_url?: string;
  unread: number;
  members: { user_id: string; name: string; role: string; isAdmin: boolean }[];
  lastMessage?: string;
  lastMessageTime?: string;
  updatedAt?: string;
}

interface ChatNote {
  id: string;
  canal_id: string;
  autor_nome: string;
  conteudo: string;
  created_at: string;
}

const getInitials = (name: string) => {
  if (!name) return '..';
  const cleanName = name.replace(/^Chat:\s*/i, '').trim();
  const parts = cleanName.split(' ').filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return cleanName.slice(0, 2).toUpperCase();
};

const getDateLabel = (dateStr: string) => {
  const msgDate = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (msgDate.toDateString() === today.toDateString()) return 'Hoje';
  if (msgDate.toDateString() === yesterday.toDateString()) return 'Ontem';
  return msgDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const mapDbToMessage = (dbMsg: any): Message => ({
  id: dbMsg.id,
  canal_id: dbMsg.canal_id,
  sender_id: dbMsg.sender_id,
  sender: dbMsg.sender_nome,
  text: dbMsg.texto,
  time: new Date(dbMsg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
  dateLabel: getDateLabel(dbMsg.created_at),
  type: dbMsg.tipo || 'text',
  status: 'sent',
  mediaUrl: dbMsg.metadata?.mediaUrl,
  fileName: dbMsg.metadata?.fileName,
  fileSize: dbMsg.metadata?.fileSize,
  eventDetails: dbMsg.metadata?.eventDetails,
  acceptedBy: dbMsg.metadata?.acceptedBy || [],
  lidoPor: dbMsg.metadata?.lidoPor || [],
  replyTo: dbMsg.metadata?.replyTo,
  created_at: dbMsg.created_at
});

const getRealUserStatus = (profile?: DBProfile | null): { status: UserStatusType; label: string; color: string; lastSeenText: string } => {
  if (!profile) return { status: 'offline', label: 'Offline', color: 'bg-gray-400', lastSeenText: 'Offline' };

  let lastSeenText = 'Visto por último recentemente';
  let diffSeconds = 999999;

  if (profile.last_seen) {
    const seenDate = new Date(profile.last_seen);
    diffSeconds = (new Date().getTime() - seenDate.getTime()) / 1000;
    const timeStr = seenDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const isToday = seenDate.toDateString() === new Date().toDateString();
    lastSeenText = isToday ? `Visto por último hoje às ${timeStr}` : `Visto em ${seenDate.toLocaleDateString('pt-BR')} às ${timeStr}`;
  }

  if (profile.status_presenca === 'offline' || diffSeconds > 65) {
    return { status: 'offline', label: 'Offline', color: 'bg-gray-400', lastSeenText };
  }
  if (profile.status_presenca === 'ocupado') {
    return { status: 'ocupado', label: 'Ocupado', color: 'bg-red-500', lastSeenText: 'Ocupado • Não perturbe' };
  }
  if (profile.status_presenca === 'indisponivel') {
    return { status: 'indisponivel', label: 'Indisponível', color: 'bg-purple-500', lastSeenText: 'Em atendimento / Indisponível' };
  }
  if (profile.status_presenca === 'ausente' || diffSeconds > 35) {
    return { status: 'ausente', label: 'Ausente', color: 'bg-amber-500 animate-pulse', lastSeenText };
  }

  return { status: 'online', label: 'Online', color: 'bg-emerald-500', lastSeenText: 'Online agora' };
};

const playNotificationSound = () => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  } catch { }
};

const QUICK_EMOJIS = ['👍', '✅', '🚀', '❤️', '😂', '🙏', '🔥', '👀', '⚠️', '🎉'];

export default function ConversasPage() {
  const { theme, changeTheme } = useTheme();

  const themes = [
    { id: 'light', name: 'Claro', color: '#f5f5f7', border: '#d2d2d7' },
    { id: 'dark', name: 'Escuro', color: '#0f172a', border: '#475569' },
    { id: 'ocean', name: 'Oceano', color: '#005bb5', border: '#005bb5' },
    { id: 'nature', name: 'Natureza', color: '#2e8b57', border: '#2e8b57' },
    { id: 'sunset', name: 'Pôr do Sol', color: '#d9534f', border: '#d9534f' },
  ];

  const [currentUser, setCurrentUser] = useState<DBProfile | null>(null);
  const [userStatus, setUserStatus] = useState<UserStatusType>('online');
  const [teamMembers, setTeamMembers] = useState<DBProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState(false);

  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeMessages, setActiveMessages] = useState<Message[]>([]);
  const [chatNotes, setChatNotes] = useState<ChatNote[]>([]);
  const [newNoteText, setNewNoteText] = useState('');
  const [groupPhotoUrl, setGroupPhotoUrl] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const inputFieldRef = useRef<HTMLInputElement>(null);
  const activeChatIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  const [inputText, setInputText] = useState('');
  const [replyingTo, setReplyingTo] = useState<ReplyInfo | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [messageSearch, setMessageSearch] = useState('');

  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedMembersToAdd, setSelectedMembersToAdd] = useState<string[]>([]);
  
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);
  const [memberToAddId, setMemberToAddId] = useState('');

  const [isInfoDrawerOpen, setIsInfoDrawerOpen] = useState(false);
  const [infoTab, setInfoTab] = useState<'members' | 'media' | 'files' | 'notes'>('members');
  
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('15:00');
  const [eventLocation, setEventLocation] = useState('');

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior });
    }, 50);
  }, []);

  const updateStatusInDatabase = useCallback(async (newStatus: UserStatusType) => {
    setUserStatus(newStatus);
    if (!currentUser) return;
    await supabase
      .from('doodoo_perfis')
      .update({ status_presenca: newStatus, last_seen: new Date().toISOString() })
      .eq('user_id', currentUser.user_id);
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const sendHeartbeat = async () => {
      await supabase.from('doodoo_perfis').update({
        last_seen: new Date().toISOString(),
        status_presenca: userStatus
      }).eq('user_id', currentUser.user_id);
    };
    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 60000); 
    return () => clearInterval(interval);
  }, [currentUser, userStatus]);

  useEffect(() => {
    let idleTimer: NodeJS.Timeout;
    const resetTimer = () => {
      clearTimeout(idleTimer);
      if (userStatus === 'ausente') updateStatusInDatabase('online');
      idleTimer = setTimeout(() => updateStatusInDatabase('ausente'), 3 * 60 * 1000);
    };

    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keydown', resetTimer);
    window.addEventListener('click', resetTimer);
    resetTimer();

    return () => {
      clearTimeout(idleTimer);
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('keydown', resetTimer);
      window.removeEventListener('click', resetTimer);
    };
  }, [userStatus, updateStatusInDatabase]);

  const activeChat = useMemo(() => channels.find(c => c.id === activeChatId) || null, [channels, activeChatId]);

  const isCurrentAdmin = useMemo(() => {
    if (!activeChat || !currentUser) return false;
    const membro = activeChat.members.find(m => m.user_id === currentUser.user_id);
    return membro?.isAdmin || ['administrador', 'gestor'].includes(currentUser.cargo);
  }, [activeChat, currentUser]);

  const directPeer = useMemo(() => {
    if (!activeChat || !activeChat.isDirect || !currentUser) return null;
    const peerInfo = activeChat.members.find(m => m.user_id !== currentUser.user_id);
    if (!peerInfo) return null;
    return teamMembers.find(m => m.user_id === peerInfo.user_id) || null;
  }, [activeChat, currentUser, teamMembers]);

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setIsLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        let perfilAtual: DBProfile | null = null;

        if (session?.user) {
          const { data } = await supabase.from('doodoo_perfis').select('*').eq('user_id', session.user.id).maybeSingle();
          perfilAtual = data;
          
          await supabase
            .from('doodoo_perfis')
            .update({ status_presenca: 'online', last_seen: new Date().toISOString() })
            .eq('user_id', session.user.id);
        }

        if (!perfilAtual) {
          const { data: fallbackUser } = await supabase.from('doodoo_perfis').select('*').limit(1).maybeSingle();
          perfilAtual = fallbackUser || (await supabase.from('doodoo_perfis').select('*').limit(1).maybeSingle()).data;
        }

        if (perfilAtual) {
          setCurrentUser(perfilAtual);
          if (perfilAtual.status_presenca) setUserStatus(perfilAtual.status_presenca);
          
          const [equipeRes, canaisRes, ultimasMsgsRes] = await Promise.all([
            supabase.from('doodoo_perfis').select('*').eq('status', 'ativo'),
            supabase.from('doodoo_canais').select('*').order('created_at', { ascending: false }),
            supabase.from('doodoo_mensagens').select('*').order('created_at', { ascending: false }).limit(200)
          ]);

          const membersList: DBProfile[] = equipeRes.data || [];
          setTeamMembers(membersList);
          const recentMsgs = ultimasMsgsRes.data || [];
          
          let rawChannels = canaisRes.data || [];

          if (perfilAtual.cargo === 'administrador') {
            const allMappedMembers = membersList.map(m => ({
              user_id: m.user_id,
              name: m.nome,
              role: m.cargo,
              isAdmin: m.cargo === 'administrador'
            }));

            let geralDbChannel = rawChannels.find(c => c.nome === 'Geral' && c.is_group);

            if (!geralDbChannel) {
              const { data: newGeral } = await supabase.from('doodoo_canais').insert([{
                nome: 'Geral',
                is_group: true,
                setor: 'Todos',
                membros: allMappedMembers
              }]).select().single();
              
              if (newGeral) {
                rawChannels = [newGeral, ...rawChannels];
              }
            } else {
              const currentMemberIds = Array.isArray(geralDbChannel.membros) ? geralDbChannel.membros.map((m: any) => m.user_id) : [];
              const missingMembers = allMappedMembers.filter(m => !currentMemberIds.includes(m.user_id));
              
              if (missingMembers.length > 0) {
                const updatedMembers = [...(geralDbChannel.membros || []), ...missingMembers];
                await supabase.from('doodoo_canais').update({ membros: updatedMembers }).eq('id', geralDbChannel.id);
                geralDbChannel.membros = updatedMembers;
              }
            }
          }

          const myChannels: ChatChannel[] = rawChannels.map(c => {
            const listaMembros = Array.isArray(c.membros) ? c.membros : [];
            const peer = c.is_direct 
              ? membersList.find((m: DBProfile) => listaMembros.some((mem: any) => mem.user_id === m.user_id && mem.user_id !== perfilAtual?.user_id)) 
              : null;
            const cleanName = peer ? peer.nome : (c.nome || 'Canal').replace(/^Chat:\s*/i, '');
            
            const lastMsgObj = recentMsgs.find(m => m.canal_id === c.id);
            const lastMsgText = lastMsgObj 
              ? (lastMsgObj.tipo === 'image' ? '📷 Imagem' : lastMsgObj.tipo === 'file' ? `📎 Arquivo Anexado` : lastMsgObj.texto)
              : (c.is_direct ? 'Conversa direta' : `${listaMembros.length} participantes`);

            const lastMsgTime = lastMsgObj
              ? new Date(lastMsgObj.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
              : '';

            return {
              id: c.id,
              name: cleanName,
              isGroup: c.is_group,
              isDirect: c.is_direct,
              sector: c.setor,
              foto_url: c.foto_url,
              unread: 0,
              members: listaMembros,
              lastMessage: lastMsgText,
              lastMessageTime: lastMsgTime,
              updatedAt: lastMsgObj?.created_at || c.created_at
            };
          });

          const canaisValidos = myChannels.filter(c => {
            const souMembro = c.members.some(m => m.user_id === perfilAtual?.user_id);
            if (!souMembro) return false; 
            
            if (c.isGroup) return true;
            return recentMsgs.some(m => m.canal_id === c.id);
          });
          
          canaisValidos.sort((a, b) => {
            if (a.name === 'Geral') return -1;
            if (b.name === 'Geral') return 1;
            return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
          });

          setChannels(canaisValidos);
          
          if (canaisValidos.length > 0) setActiveChatId(canaisValidos[0].id);
        } else {
          setAuthError(true);
        }
      } catch (error) {
        console.error("Erro crítico no Chat:", error);
        setAuthError(true);
      } finally {
        setIsLoading(false);
      }
    };
    fetchInitialData();
  }, []);

  const fetchMessagesForActiveChannel = useCallback(async (channelId: string, isSilentSync = false) => {
    const limite7Dias = new Date();
    limite7Dias.setDate(limite7Dias.getDate() - 7);

    const { data: msgData } = await supabase
      .from('doodoo_mensagens')
      .select('*')
      .eq('canal_id', channelId)
      .gte('created_at', limite7Dias.toISOString())
      .order('created_at', { ascending: true });

    if (msgData) {
      const mapped = msgData.map(mapDbToMessage);

      setActiveMessages(prev => {
        const pendingOptimistic = prev.filter(m => m.status === 'sending' && m.canal_id === channelId);
        if (isSilentSync && pendingOptimistic.length === 0 && prev.length === mapped.length) {
          const prevLast = prev[prev.length - 1];
          const newLast = mapped[mapped.length - 1];
          if (prevLast?.id === newLast?.id && JSON.stringify(prevLast?.lidoPor) === JSON.stringify(newLast?.lidoPor)) return prev;
        }
        const filteredOptimistic = pendingOptimistic.filter(
          opt => !mapped.some(dbm => dbm.text === opt.text && dbm.sender_id === opt.sender_id)
        );
        return [...mapped, ...filteredOptimistic];
      });

      if (currentUser) {
        const unreadMsgs = msgData.filter(m => {
          const lidos = m.metadata?.lidoPor || [];
          return !lidos.includes(currentUser.nome) && m.sender_id !== currentUser.user_id;
        });

        if (unreadMsgs.length > 0) {
          Promise.all(unreadMsgs.map(m => {
            const lidos = m.metadata?.lidoPor || [];
            return supabase.from('doodoo_mensagens').update({
              metadata: { ...m.metadata, lidoPor: [...lidos, currentUser.nome] }
            }).eq('id', m.id);
          }));
        }
      }
    }
  }, [currentUser]);

  useEffect(() => {
    if (!activeChatId) return;
    setReplyingTo(null);
    setShowEmojiPicker(false);

    setChannels(prev => prev.filter(c => !c.id.startsWith('temp_chat_') || c.id === activeChatId));
    setChannels(prev => prev.map(c => c.id === activeChatId ? { ...c, unread: 0 } : c));

    if (!activeChatId.startsWith('temp_chat_')) {
      fetchMessagesForActiveChannel(activeChatId, false).then(() => scrollToBottom('auto'));
      supabase
        .from('doodoo_chat_notas')
        .select('*')
        .eq('canal_id', activeChatId)
        .order('created_at', { ascending: false })
        .then(({ data }) => {
          if (data) setChatNotes(data as ChatNote[]);
        });
    } else {
      setActiveMessages([]); 
      setChatNotes([]);
    }
  }, [activeChatId, fetchMessagesForActiveChannel, scrollToBottom]);

  useEffect(() => {
    if (activeChat) setGroupPhotoUrl(activeChat.foto_url || '');
  }, [activeChat?.id, activeChat?.foto_url]);

  // =======================================================================
  // 🚀 WEBSOCKET GLOBAL BLINDADO (7 OUVINTES - TEMPO REAL ABSOLUTO SEM F5)
  // =======================================================================
  useEffect(() => {
    if (!currentUser) return;

    const globalSub = supabase
      .channel('doodoo_whatsapp_realtime_v3')
      // 1. Escuta Novas Mensagens
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'doodoo_mensagens' }, (payload) => {
        const incoming = mapDbToMessage(payload.new);
        const currentActiveId = activeChatIdRef.current;

        setChannels(prev => prev.map(c => {
          if (c.id === incoming.canal_id) {
            const isCurrentlyOpen = c.id === currentActiveId;
            return {
              ...c,
              lastMessage: incoming.type === 'image' ? '📷 Imagem' : incoming.type === 'file' ? `📎 ${incoming.fileName}` : incoming.text,
              lastMessageTime: incoming.time,
              unread: isCurrentlyOpen ? 0 : (c.unread || 0) + 1,
              updatedAt: incoming.created_at
            };
          }
          return c;
        }));

        if (incoming.canal_id === currentActiveId) {
          setActiveMessages(prev => {
            if (prev.some(m => m.id === incoming.id)) return prev;
            const tempIndex = prev.findIndex(m => m.status === 'sending' && m.text === incoming.text && m.sender_id === incoming.sender_id);
            if (tempIndex !== -1) {
              const clone = [...prev];
              clone[tempIndex] = incoming;
              return clone;
            }
            return [...prev, incoming];
          });
          if (incoming.sender_id !== currentUser.user_id) playNotificationSound();
          scrollToBottom('smooth');
        } else if (incoming.sender_id !== currentUser.user_id) {
          playNotificationSound();
          notifyBell('Nova Mensagem', `${incoming.sender}: ${incoming.text}`);
        }
      })
      // 2. Escuta Atualizações (ex: Visto / Lido por)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'doodoo_mensagens' }, (payload) => {
        const updated = mapDbToMessage(payload.new);
        if (updated.canal_id === activeChatIdRef.current) setActiveMessages(prev => prev.map(m => m.id === updated.id ? updated : m));
      })
      // 3. Escuta Exclusão de Mensagens (Apaga para todos IMEDIATAMENTE)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'doodoo_mensagens' }, (payload) => {
        const deletedId = payload.old?.id || (payload.old as any)?.old_record?.id;
        if (deletedId) {
          setActiveMessages(prev => prev.filter(m => m.id !== deletedId));
        }
      })
      // 4. Escuta Mudança de Status Online/Offline de qualquer colega
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'doodoo_perfis' }, (payload) => {
        const updatedProfile = payload.new as DBProfile;
        setTeamMembers(prev => prev.map(m => m.user_id === updatedProfile.user_id ? { ...m, ...updatedProfile } : m));
      })
      // 5. Escuta Novos Grupos sendo criados
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'doodoo_canais' }, (payload) => {
        const newChannel = payload.new;
        if (Array.isArray(newChannel.membros) && newChannel.membros.some((m: any) => m.user_id === currentUser.user_id)) {
          setChannels(prev => {
            if (prev.some(c => c.id === newChannel.id)) return prev;
            
            const peer = newChannel.is_direct ? newChannel.membros.find((m: any) => m.user_id !== currentUser.user_id) : null;
            const cleanName = peer ? peer.name : (newChannel.nome || 'Canal').replace(/^Chat:\s*/i, '');
            
            const mapped: ChatChannel = {
              id: newChannel.id,
              name: cleanName,
              isGroup: newChannel.is_group,
              isDirect: newChannel.is_direct,
              sector: newChannel.setor,
              foto_url: newChannel.foto_url,
              unread: 1,
              members: newChannel.membros,
              lastMessage: 'Conversa iniciada',
              lastMessageTime: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
              updatedAt: newChannel.created_at
            };
            
            const result = [mapped, ...prev];
            return result.sort((a, b) => {
              if (a.name === 'Geral') return -1;
              if (b.name === 'Geral') return 1;
              return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
            });
          });
        }
      })
      // 6. Escuta Alteração de Dados do Grupo (ex: nova foto)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'doodoo_canais' }, (payload) => {
        const updated = payload.new;
        setChannels(prev => prev.map(c => c.id === updated.id ? { 
          ...c, 
          foto_url: updated.foto_url, 
          members: updated.membros, 
          name: c.isDirect ? c.name : updated.nome 
        } : c));
      })
      // 7. Escuta Conversas ou Grupos Sendo Excluídos
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'doodoo_canais' }, (payload) => {
        const deletedId = payload.old?.id || (payload.old as any)?.old_record?.id;
        if (deletedId) {
          setChannels(prev => prev.filter(c => c.id !== deletedId));
          if (activeChatIdRef.current === deletedId) {
            setActiveChatId(null);
            setIsInfoDrawerOpen(false);
          }
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(globalSub); };
  }, [currentUser, scrollToBottom]);

  const notifyBell = (title: string, desc: string) => {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('doodoo:notify', { detail: { title, desc } }));
  };

  const handleForceLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  const sendToDatabase = async (tipo: 'text' | 'image' | 'file' | 'event', texto: string, metadata: any = {}) => {
    if (!currentUser || !activeChatId) return;

    let targetChannelId = activeChatId;
    const timeFormatted = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const nowIso = new Date().toISOString();
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const replyData = replyingTo ? { id: replyingTo.id, sender: replyingTo.sender, text: replyingTo.text } : undefined;

    if (targetChannelId.startsWith('temp_chat_')) {
      const tempChannel = channels.find(c => c.id === targetChannelId);
      if (!tempChannel) return;

      const { data: newDbChannel, error: chanErr } = await supabase.from('doodoo_canais').insert([{
        nome: tempChannel.name,
        is_group: false,
        is_direct: true,
        membros: tempChannel.members
      }]).select().single();

      if (newDbChannel && !chanErr) {
        targetChannelId = newDbChannel.id;
        setChannels(prev => prev.map(c => c.id === activeChatId ? { ...c, id: targetChannelId } : c));
        setActiveChatId(targetChannelId); 
      } else {
        notifyBell('Erro', 'Não foi possível iniciar a conversa.');
        return;
      }
    }

    const optimisticMsg: Message = {
      id: tempId,
      canal_id: targetChannelId,
      sender_id: currentUser.user_id,
      sender: currentUser.nome,
      text: texto,
      time: timeFormatted,
      dateLabel: 'Hoje',
      type: tipo,
      status: 'sending',
      mediaUrl: metadata.mediaUrl,
      fileName: metadata.fileName,
      fileSize: metadata.fileSize,
      eventDetails: metadata.eventDetails,
      acceptedBy: [],
      lidoPor: [currentUser.nome],
      replyTo: replyData,
      created_at: nowIso
    };

    setActiveMessages(prev => [...prev, optimisticMsg]);
    setReplyingTo(null);
    setShowEmojiPicker(false);
    scrollToBottom('smooth');

    setChannels(prev => prev.map(c => c.id === targetChannelId ? {
      ...c,
      lastMessage: tipo === 'text' ? `Você: ${texto}` : 'Você enviou um anexo',
      lastMessageTime: timeFormatted,
      updatedAt: nowIso
    } : c));

    const { data, error } = await supabase
      .from('doodoo_mensagens')
      .insert([{
        canal_id: targetChannelId,
        sender_id: currentUser.user_id,
        sender_nome: currentUser.nome,
        texto: texto,
        tipo: tipo,
        metadata: { ...metadata, lidoPor: [currentUser.nome], replyTo: replyData }
      }])
      .select()
      .single();

    if (data && !error) {
      const confirmedMsg = mapDbToMessage(data);
      setActiveMessages(prev => {
        if (prev.some(m => m.id === confirmedMsg.id)) return prev.filter(m => m.id !== tempId);
        return prev.map(m => m.id === tempId ? confirmedMsg : m);
      });
    } else {
      setActiveMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'error' } : m));
      notifyBell('Falha no Envio', 'Não foi possível entregar a mensagem.');
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !activeChatId) return;
    const textToSend = inputText.trim();
    setInputText('');
    await sendToDatabase('text', textToSend);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'file') => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;

    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      alert(`O arquivo excede o limite máximo permitido de 10 MB.`);
      e.target.value = '';
      return;
    }

    try {
      notifyBell('Enviando...', 'O arquivo está a ser enviado para o servidor.');
      const ext = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}.${ext}`;
      const filePath = `${type}s/${fileName}`;

      const { error: uploadError } = await supabase.storage.from('chat_midia').upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from('chat_midia').getPublicUrl(filePath);
      const fileUrl = publicUrlData.publicUrl;
      const fileSize = `${(file.size / (1024 * 1024)).toFixed(1)} MB`;

      if (type === 'image') {
        await sendToDatabase('image', 'Enviou uma imagem', { mediaUrl: fileUrl, fileSize });
      } else {
        await sendToDatabase('file', file.name, { fileName: file.name, fileSize, mediaUrl: fileUrl });
      }
    } catch (error) {
      console.error("Erro no upload:", error);
      notifyBell('Erro no Upload', 'Certifique-se de que o bucket chat_midia está criado e configurado como público no Supabase.');
    } finally {
      e.target.value = '';
    }
  };

  const confirmDeleteMessage = (msgId: string) => {
    setConfirmModal({
      isOpen: true, title: 'Apagar Mensagem', message: 'Deseja apagar esta mensagem para todos na conversa?',
      onConfirm: async () => {
        setActiveMessages(prev => prev.filter(m => m.id !== msgId));
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        await supabase.from('doodoo_mensagens').delete().eq('id', msgId);
        notifyBell('Mensagem Apagada', 'A mensagem foi removida da conversa.');
      }
    });
  };

  const handleCloseChat = async (channelId: string) => {
    if (channels.find(c => c.id === channelId)?.name === 'Geral') {
      return notifyBell('Ação Bloqueada', 'O canal Geral não pode ser excluído.');
    }

    setConfirmModal({
      isOpen: true, title: 'Encerrar Conversa', message: 'Deseja encerrar e remover esta conversa da sua lista de chats ativos?',
      onConfirm: async () => {
        if (!channelId.startsWith('temp_chat_')) {
          await supabase.from('doodoo_canais').delete().eq('id', channelId);
        }
        setChannels(prev => prev.filter(c => c.id !== channelId));
        setActiveChatId(null);
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        setIsInfoDrawerOpen(false);
        notifyBell('Conversa Encerrada', 'O chat foi removido com sucesso.');
      }
    });
  };

  const handleCreateChatEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventTitle.trim()) return;
    await sendToDatabase('event', `Convite de Reunião: ${eventTitle}`, {
      eventDetails: { title: eventTitle.trim(), date: eventDate ? eventDate.split('-').reverse().join('/') : 'Hoje', time: eventTime, location: eventLocation.trim() || 'Sala de Reuniões' },
      acceptedBy: []
    });
    setIsEventModalOpen(false);
    setEventTitle('');
    notifyBell('📅 Evento Publicado no Chat', `O convite "${eventTitle}" foi enviado para o canal.`);
  };

  const handleAcceptChatEvent = async (msg: Message) => {
    if (!currentUser || msg.acceptedBy?.includes(currentUser.nome)) return;
    const novaLista = [...(msg.acceptedBy || []), currentUser.nome];
    setActiveMessages(prev => prev.map(m => m.id === msg.id ? { ...m, acceptedBy: novaLista } : m));
    await supabase.from('doodoo_mensagens').update({ 
      metadata: { acceptedBy: novaLista, eventDetails: msg.eventDetails, mediaUrl: msg.mediaUrl, fileName: msg.fileName, lidoPor: msg.lidoPor, replyTo: msg.replyTo } 
    }).eq('id', msg.id);
    notifyBell('✅ Presença Confirmada', 'Você confirmou presença no evento.');
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim() || !currentUser) return;

    if (newGroupName.trim().toLowerCase() === 'geral') {
      return notifyBell('Nome Inválido', 'Já existe um canal reservado com este nome.');
    }

    const membrosIniciais = [
      { user_id: currentUser.user_id, name: currentUser.nome, role: currentUser.cargo, isAdmin: true },
      ...teamMembers.filter(m => selectedMembersToAdd.includes(m.user_id)).map(m => ({ user_id: m.user_id, name: m.nome, role: m.cargo, isAdmin: false }))
    ];

    const { data } = await supabase.from('doodoo_canais').insert([{
      nome: newGroupName.trim(), is_group: true, setor: currentUser.setor, membros: membrosIniciais
    }]).select().single();

    if (data) {
      const newGroup: ChatChannel = {
        id: data.id, name: data.nome, isGroup: data.is_group, sector: data.setor, unread: 0, members: data.membros,
        lastMessage: 'Grupo criado', lastMessageTime: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      };
      setChannels(prev => [newGroup, ...prev]);
      setActiveChatId(data.id);
      setIsGroupModalOpen(false);
      await supabase.from('doodoo_mensagens').insert([{ canal_id: data.id, sender_id: currentUser.user_id, sender_nome: 'Sistema Doo-Doo', texto: `Grupo "${newGroupName}" criado por ${currentUser.nome}.`, tipo: 'text' }]);
      setNewGroupName(''); setSelectedMembersToAdd([]);
      notifyBell('Grupo Criado', `O canal "${newGroup.name}" está ativo.`);
    }
  };

  const handleOpenDirectChat = async (colab: DBProfile) => {
    if (!currentUser || colab.user_id === currentUser.user_id) return;

    const existingChat = channels.find(c => c.isDirect && c.members.some(m => m.user_id === colab.user_id) && !c.id.startsWith('temp_chat_'));
    if (existingChat) {
      setActiveChatId(existingChat.id);
      setSearchQuery('');
      return;
    }

    const tempId = `temp_chat_${colab.user_id}`;
    if (channels.find(c => c.id === tempId)) {
      setActiveChatId(tempId);
      setSearchQuery('');
      return;
    }

    const membrosDiretos = [
      { user_id: currentUser.user_id, name: currentUser.nome, role: currentUser.cargo, isAdmin: true },
      { user_id: colab.user_id, name: colab.nome, role: colab.cargo, isAdmin: true }
    ];

    const newDirect: ChatChannel = {
      id: tempId,
      name: colab.nome,
      isGroup: false,
      isDirect: true,
      unread: 0,
      members: membrosDiretos,
      lastMessage: 'Nova conversa',
      lastMessageTime: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    };
    
    setChannels(prev => [newDirect, ...prev]);
    setActiveChatId(tempId);
    setSearchQuery('');
  };

  const handleAddMemberToGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberToAddId || !activeChat) return;
    const userToAdd = teamMembers.find(m => m.user_id === memberToAddId);
    if (!userToAdd || activeChat.members.some(m => m.user_id === memberToAddId)) return;
    const updatedMembers = [...activeChat.members, { user_id: userToAdd.user_id, name: userToAdd.nome, role: userToAdd.cargo, isAdmin: false }];
    await supabase.from('doodoo_canais').update({ membros: updatedMembers }).eq('id', activeChat.id);
    setChannels(prev => prev.map(c => c.id === activeChat.id ? { ...c, members: updatedMembers } : c));
    setIsAddMemberModalOpen(false); setMemberToAddId('');
    notifyBell('Membro Adicionado', `${userToAdd.nome} foi adicionado ao grupo.`);
  };

  const handleRemoveMemberFromGroup = (targetUserId: string, targetName: string) => {
    if (!activeChat) return;
    if (activeChat.name === 'Geral') return notifyBell('Ação Bloqueada', 'Não é possível remover membros do canal Geral.');
    
    setConfirmModal({
      isOpen: true, title: 'Remover Membro', message: `Tem certeza que deseja remover ${targetName} deste grupo?`,
      onConfirm: async () => {
        const updatedMembers = activeChat.members.filter(m => m.user_id !== targetUserId);
        await supabase.from('doodoo_canais').update({ membros: updatedMembers }).eq('id', activeChat.id);
        setChannels(prev => prev.map(c => c.id === activeChat.id ? { ...c, members: updatedMembers } : c));
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        notifyBell('Membro Removido', `${targetName} foi retirado do grupo.`);
      }
    });
  };

  const toggleAdminMember = async (targetUserId: string) => {
    if (!activeChat || !isCurrentAdmin) return;
    const updatedMembers = activeChat.members.map(m => m.user_id === targetUserId ? { ...m, isAdmin: !m.isAdmin } : m);
    await supabase.from('doodoo_canais').update({ membros: updatedMembers }).eq('id', activeChat.id);
    setChannels(prev => prev.map(c => c.id === activeChat.id ? { ...c, members: updatedMembers } : c));
    notifyBell('Permissão Atualizada', 'O cargo administrativo foi alterado.');
  };

  const handleSaveGroupPhoto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChat) return;
    await supabase.from('doodoo_canais').update({ foto_url: groupPhotoUrl.trim() }).eq('id', activeChat.id);
    setChannels(prev => prev.map(c => c.id === activeChat.id ? { ...c, foto_url: groupPhotoUrl.trim() } : c));
    notifyBell('Foto Atualizada', 'A imagem do grupo foi alterada.');
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteText.trim() || !activeChatId || !currentUser) return;
    const textoNota = newNoteText.trim();
    setNewNoteText('');
    const { data, error } = await supabase.from('doodoo_chat_notas').insert([{ canal_id: activeChatId, autor_nome: currentUser.nome, conteudo: textoNota }]).select().single();
    if (data && !error) {
      setChatNotes(prev => prev.some(n => n.id === data.id) ? prev : [data as ChatNote, ...prev]);
      notifyBell('Nota Fixada', 'Anotação guardada no grupo.');
    }
  };

  const filteredTeamMembers = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return teamMembers.filter(m => m.user_id !== currentUser?.user_id && (m.nome.toLowerCase().includes(q) || m.setor.toLowerCase().includes(q)));
  }, [teamMembers, searchQuery, currentUser]);

  const filteredChannels = useMemo(() => {
    const list = !searchQuery.trim() ? channels : channels.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()));
    return [...list].sort((a, b) => {
       if (a.name === 'Geral') return -1;
       if (b.name === 'Geral') return 1;
       return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
    });
  }, [channels, searchQuery]);

  const filteredMessages = useMemo(() => {
    if (!messageSearch.trim()) return activeMessages;
    const q = messageSearch.toLowerCase();
    return activeMessages.filter(m => m.text.toLowerCase().includes(q) || m.sender.toLowerCase().includes(q));
  }, [activeMessages, messageSearch]);

  if (isLoading) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin opacity-50 text-blue-500" />
        <span className="text-xs font-bold opacity-50 mt-2">Sincronizando conversas...</span>
      </div>
    );
  }

  if (authError || !currentUser) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center space-y-5 animate-in fade-in zoom-in-95 duration-300">
        <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center">
          <AlertTriangle className="w-10 h-10 text-red-500 opacity-80" />
        </div>
        <div className="text-center space-y-1.5">
          <h3 className="text-xl font-extrabold tracking-tight">Sessão Expirada</h3>
          <p className="text-xs font-medium opacity-60 max-w-sm mx-auto leading-relaxed">Conexão interrompida. Por favor, entre novamente.</p>
        </div>
        <button onClick={handleForceLogout} className="mt-2 px-6 py-3 rounded-2xl bg-brand-panel text-white text-xs font-extrabold cursor-pointer flex items-center space-x-2 shadow-lg">
          <LogOut className="w-4 h-4" /><span>Sair e Entrar Novamente</span>
        </button>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col animate-in fade-in duration-300">
      
      <input type="file" ref={imageInputRef} onChange={(e) => handleFileUpload(e, 'image')} accept="image/*" className="hidden" />
      <input type="file" ref={fileInputRef} onChange={(e) => handleFileUpload(e, 'file')} accept=".pdf,.doc,.docx,.xls,.xlsx,.txt" className="hidden" />

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 rounded-[2.5rem] border overflow-hidden shadow-2xl backdrop-blur-xl relative" 
           style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
        
        {/* COLUNA 1: LISTA DE CONVERSAS */}
        <div className="lg:col-span-3 border-r p-5 flex flex-col justify-between" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
          
          <div className="space-y-4">
            <div className="space-y-3 pb-4 border-b" style={{ borderColor: 'var(--border-input)' }}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-sm tracking-tight">Chat Corporativo</h3>
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-45">Messenger • 7 dias</p>
                </div>

                <div className="flex items-center px-2 py-1 rounded-xl border shadow-sm" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
                  <Palette className="w-3.5 h-3.5 mr-1.5 opacity-40 flex-shrink-0" />
                  <div className="flex items-center space-x-1">
                    {themes.map((t) => {
                      const isSelected = theme === t.id;
                      return (
                        <button
                          key={t.id}
                          onClick={() => changeTheme(t.id)}
                          style={{ width: '10px', height: '10px', backgroundColor: t.color, borderColor: t.border, boxShadow: isSelected ? `0 0 0 2px var(--bg-card), 0 0 0 2.5px ${t.border}` : 'none' }}
                          className={`rounded-full border transition-all duration-300 flex-shrink-0 cursor-pointer ${isSelected ? 'scale-110' : 'opacity-70 hover:opacity-100'}`}
                          title={t.name}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between px-3 py-2 rounded-xl border text-xs font-bold" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
                <div className="flex items-center space-x-2 truncate">
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                    userStatus === 'online' ? 'bg-emerald-500' :
                    userStatus === 'ausente' ? 'bg-amber-500 animate-pulse' :
                    userStatus === 'ocupado' ? 'bg-red-500' :
                    userStatus === 'indisponivel' ? 'bg-purple-500' : 'bg-gray-400'
                  }`} />
                  <span className="truncate">{currentUser.nome}</span>
                </div>
                
                <select 
                  value={userStatus}
                  onChange={(e: any) => updateStatusInDatabase(e.target.value)}
                  className="bg-transparent text-[10px] uppercase font-extrabold outline-none cursor-pointer opacity-80"
                >
                  <option value="online">Online</option>
                  <option value="ausente">Ausente</option>
                  <option value="ocupado">Ocupado</option>
                  <option value="indisponivel">Indisponível</option>
                  <option value="offline">Offline</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase tracking-widest opacity-40">Canais & Diretos</span>
                <button 
                  onClick={() => setIsGroupModalOpen(true)}
                  className="text-[10px] font-extrabold text-blue-500 hover:underline flex items-center space-x-1 cursor-pointer"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>+ Novo Grupo</span>
                </button>
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
                <input 
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Iniciar ou buscar conversa..."
                  className="w-full pl-8 pr-3 py-2 rounded-xl border text-xs outline-none focus:border-blue-500"
                  style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
                />
              </div>
            </div>

            <div className="space-y-1.5 max-h-[calc(100vh-280px)] overflow-y-auto custom-scrollbar">
              
              {searchQuery.trim() !== '' && filteredTeamMembers.length > 0 && (
                <div className="mb-3">
                  <span className="text-[9px] font-extrabold uppercase tracking-wider opacity-40 px-1 mb-1 block">Colaboradores Encontrados</span>
                  {filteredTeamMembers.map(colab => {
                    const peerStatus = getRealUserStatus(colab);
                    return (
                      <button
                        key={colab.user_id}
                        onClick={() => handleOpenDirectChat(colab)}
                        className="w-full text-left p-2.5 rounded-xl border transition-all cursor-pointer flex items-center space-x-2.5 hover:bg-black/5 dark:hover:bg-white/5 my-1 bg-blue-500/5 border-blue-500/20"
                      >
                        <div className="relative flex-shrink-0">
                          {colab.avatar_url ? (
                            <img src={colab.avatar_url} alt="" className="w-8 h-8 rounded-xl object-cover" />
                          ) : (
                            <div className="w-8 h-8 rounded-xl bg-brand-panel text-white font-bold flex items-center justify-center text-[10px]">
                              {getInitials(colab.nome)}
                            </div>
                          )}
                          <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${peerStatus.color}`} />
                        </div>
                        <div className="truncate flex-1">
                          <p className="text-xs font-bold truncate">{colab.nome}</p>
                          <p className="text-[10px] opacity-55 truncate">{colab.setor} • {peerStatus.label}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {filteredChannels.map(chat => {
                const isActive = chat.id === activeChatId;
                const isGeneralGroup = chat.name === 'Geral';
                const peerForChannel = chat.isDirect 
                  ? teamMembers.find(m => chat.members.some(mem => mem.user_id === m.user_id && mem.user_id !== currentUser?.user_id)) 
                  : null;
                const displayName = peerForChannel ? peerForChannel.nome : chat.name.replace(/^Chat:\s*/i, '');

                return (
                  <button
                    key={chat.id}
                    onClick={() => {
                      setActiveChatId(chat.id);
                      setIsInfoDrawerOpen(false);
                    }}
                    className={`w-full text-left p-3 rounded-2xl border transition-all cursor-pointer flex items-center space-x-3 ${
                      isActive ? 'bg-brand-panel text-white shadow-sm border-transparent' : 'hover:bg-black/5 dark:hover:bg-white/5'
                    }`}
                    style={!isActive ? { backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' } : undefined}
                  >
                    <div className="relative flex-shrink-0">
                      {isGeneralGroup ? (
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shadow-inner ${isActive ? 'bg-white/20 text-white' : 'bg-blue-500/10 text-blue-500'}`}>
                           <Megaphone className="w-5 h-5" />
                        </div>
                      ) : chat.foto_url ? (
                        <img src={chat.foto_url} alt="" className="w-10 h-10 rounded-2xl object-cover" />
                      ) : peerForChannel?.avatar_url ? (
                        <img src={peerForChannel.avatar_url} alt="" className="w-10 h-10 rounded-2xl object-cover" />
                      ) : (
                        <div className={`w-10 h-10 rounded-2xl text-white font-extrabold flex items-center justify-center text-xs ${isActive ? 'bg-white/20' : 'bg-brand-panel'}`}>
                          {getInitials(displayName)}
                        </div>
                      )}
                      {chat.isDirect && peerForChannel && (
                        <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${getRealUserStatus(peerForChannel).color}`} />
                      )}
                    </div>

                    <div className="overflow-hidden flex-1">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-extrabold truncate">{displayName}</p>
                        {chat.lastMessageTime && (
                          <span className={`text-[9px] font-bold ml-1 flex-shrink-0 ${isActive ? 'text-white/80' : 'opacity-45'}`}>
                            {chat.lastMessageTime}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <p className={`text-[11px] truncate ${isActive ? 'text-white/85' : 'opacity-60'}`}>
                          {chat.lastMessage || (chat.isDirect ? getRealUserStatus(peerForChannel).label : `${chat.members.length} membros`)}
                        </p>
                        {chat.unread > 0 && !isActive && (
                          <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-emerald-500 text-white text-[9px] font-extrabold">
                            {chat.unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-3 border-t text-center text-[10px] opacity-40 font-bold uppercase tracking-wider" style={{ borderColor: 'var(--border-input)' }}>
            Criptografia & Retenção de 7 dias
          </div>
        </div>

        {/* COLUNA 2: ÁREA DE MENSAGENS */}
        {activeChat ? (
          <div className={`${isInfoDrawerOpen ? 'lg:col-span-6' : 'lg:col-span-9'} flex flex-col h-full overflow-hidden transition-all`} style={{ backgroundColor: 'var(--bg-card)' }}>
            
            {/* CABEÇALHO DO CHAT */}
            <div 
              onClick={() => setIsInfoDrawerOpen(!isInfoDrawerOpen)}
              className="px-6 py-3.5 border-b flex items-center justify-between cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors" 
              style={{ borderColor: 'var(--border-input)' }}
            >
              <div className="flex items-center space-x-3">
                <div className="relative flex-shrink-0">
                  {activeChat.name === 'Geral' ? (
                     <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-blue-500/10 text-blue-500 shadow-sm border" style={{ borderColor: 'var(--border-input)' }}>
                        <Megaphone className="w-5 h-5" />
                     </div>
                  ) : activeChat.foto_url ? (
                    <img src={activeChat.foto_url} alt="" className="w-10 h-10 rounded-2xl object-cover shadow-sm border" style={{ borderColor: 'var(--border-input)' }} />
                  ) : directPeer?.avatar_url ? (
                    <img src={directPeer.avatar_url} alt="" className="w-10 h-10 rounded-2xl object-cover shadow-sm border" style={{ borderColor: 'var(--border-input)' }} />
                  ) : (
                    <div className="w-10 h-10 rounded-2xl bg-brand-panel text-white font-extrabold flex items-center justify-center text-xs shadow-sm">
                      {getInitials(directPeer ? directPeer.nome : activeChat.name)}
                    </div>
                  )}
                  {activeChat.isDirect && directPeer && (
                    <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${getRealUserStatus(directPeer).color}`} />
                  )}
                </div>

                <div>
                  <h3 className="text-sm font-extrabold">{directPeer ? directPeer.nome : activeChat.name}</h3>
                  <p className="text-[11px] opacity-60 font-medium flex items-center space-x-1.5">
                    {activeChat.isDirect && directPeer ? (
                      <>
                        <span className="font-bold">{getRealUserStatus(directPeer).label}</span>
                        <span>• {getRealUserStatus(directPeer).lastSeenText}</span>
                      </>
                    ) : (
                      <span>{activeChat.members.map(m => m.name?.split(' ')[0] || 'Membro').join(', ')} • Clique para dados</span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2" onClick={(e) => e.stopPropagation()}>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
                  <input 
                    type="text" 
                    value={messageSearch}
                    onChange={(e) => setMessageSearch(e.target.value)}
                    placeholder="Pesquisar na conversa..."
                    className="w-44 pl-8 pr-3 py-1.5 rounded-xl border text-[11px] outline-none focus:border-blue-500"
                    style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
                  />
                </div>
              </div>
            </div>

            {/* CORPO DAS MENSAGENS */}
            <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar" style={{ backgroundColor: 'var(--bg-input)' }}>
              {filteredMessages.map((msg, index) => {
                const isMe = msg.sender_id === currentUser.user_id || msg.sender === currentUser.nome;
                const hasAccepted = msg.acceptedBy?.includes(currentUser.nome);
                const isRead = (msg.lidoPor || []).length > 1;
                const showDateChip = index === 0 || filteredMessages[index - 1].dateLabel !== msg.dateLabel;

                return (
                  <div key={msg.id} className="space-y-3">
                    {showDateChip && (
                      <div className="flex justify-center my-2">
                        <span className="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider shadow-2xs border opacity-75"
                              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
                          {msg.dateLabel}
                        </span>
                      </div>
                    )}

                    <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} group relative`}>
                      
                      <div className="flex items-center space-x-1.5 mb-1 px-1">
                        {!isMe && !activeChat.isDirect && (
                          <span className="text-[10px] font-extrabold text-blue-500">{msg.sender}</span>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setReplyingTo({ id: msg.id, sender: msg.sender, text: msg.text });
                            inputFieldRef.current?.focus();
                          }}
                          className="opacity-0 group-hover:opacity-100 text-[10px] font-bold opacity-60 hover:opacity-100 flex items-center space-x-0.5 cursor-pointer transition-opacity"
                          title="Responder"
                        >
                          <Reply className="w-3 h-3" />
                          <span>Responder</span>
                        </button>
                        {isMe && (
                          <button 
                            type="button"
                            onClick={() => confirmDeleteMessage(msg.id)}
                            className="opacity-0 group-hover:opacity-100 text-red-500 hover:scale-110 transition-all cursor-pointer ml-1"
                            title="Apagar mensagem"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      <div className={`p-3 rounded-2xl text-xs leading-relaxed max-w-md shadow-xs relative ${
                        isMe ? 'bg-brand-panel text-white rounded-br-xs' : 'border rounded-bl-xs'
                      }`} style={!isMe ? { backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' } : undefined}>
                        
                        {msg.replyTo && (
                          <div className={`mb-2 p-2 rounded-xl border-l-4 text-[11px] ${
                            isMe ? 'bg-black/20 border-white/60 text-white/90' : 'bg-black/5 dark:bg-white/5 border-blue-500'
                          }`}>
                            <p className="font-extrabold text-[10px] opacity-85">{msg.replyTo.sender}</p>
                            <p className="truncate opacity-75">{msg.replyTo.text}</p>
                          </div>
                        )}

                        {msg.type === 'image' && msg.mediaUrl ? (
                          <div className="space-y-1.5">
                            <img src={msg.mediaUrl} alt="Mídia" className="w-64 h-48 object-cover rounded-xl" />
                            <div className="flex justify-between items-center text-[10px] opacity-80">
                              <span>📷 Imagem</span>
                              <span>{msg.fileSize}</span>
                            </div>
                          </div>
                        ) : msg.type === 'file' ? (
                          <div className="flex items-center space-x-3 pr-2">
                            <div className={`p-2.5 rounded-xl ${isMe ? 'bg-white/20 text-white' : 'bg-blue-500/10 text-blue-500'}`}>
                              <FileText className="w-5 h-5" />
                            </div>
                            <div className="overflow-hidden flex-1">
                              <p className="text-xs font-bold truncate">{msg.fileName}</p>
                              <p className="text-[10px] opacity-70">Documento • {msg.fileSize || 'PDF'}</p>
                            </div>
                            <a href={msg.mediaUrl || '#'} download={msg.fileName} className="p-2 rounded-xl hover:bg-black/10 cursor-pointer" title="Baixar">
                              <Download className="w-4 h-4" />
                            </a>
                          </div>
                        ) : msg.type === 'event' && msg.eventDetails ? (
                          <div className="space-y-2 min-w-[230px]">
                            <div className="flex items-center space-x-1.5 text-[10px] font-extrabold uppercase opacity-90">
                              <Calendar className="w-3.5 h-3.5" />
                              <span>Convite de Reunião</span>
                            </div>
                            <h4 className="text-xs font-extrabold">{msg.eventDetails.title}</h4>
                            <p className="text-[11px] opacity-85">
                              📅 {msg.eventDetails.date} às {msg.eventDetails.time}<br />
                              📍 {msg.eventDetails.location}
                            </p>
                            <div className="pt-2 border-t border-white/20 flex items-center justify-between text-[11px]">
                              <span className="opacity-80">{msg.acceptedBy?.length || 0} confirmados</span>
                              <button 
                                type="button"
                                onClick={() => handleAcceptChatEvent(msg)}
                                disabled={hasAccepted}
                                className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center space-x-1 ${
                                  hasAccepted ? 'bg-emerald-500 text-white' : 'bg-white text-slate-900 hover:opacity-90'
                                }`}
                              >
                                <Check className="w-3 h-3" />
                                <span>{hasAccepted ? 'Confirmado' : 'Confirmar'}</span>
                              </button>
                            </div>
                          </div>
                        ) : (
                          <span className="whitespace-pre-wrap break-words">{msg.text}</span>
                        )}

                        <div className={`flex items-center justify-end space-x-1 mt-1 text-[9px] ${isMe ? 'text-white/75' : 'opacity-45'}`}>
                          <span>{msg.time}</span>
                          {isMe && (
                            msg.status === 'sending' ? (
                              <span title="Enviando..." className="inline-flex"><Clock className="w-3 h-3 animate-spin" /></span>
                            ) : msg.status === 'error' ? (
                              <span title="Erro ao enviar" className="inline-flex"><AlertTriangle className="w-3 h-3 text-red-300" /></span>
                            ) : (
                              <span title={isRead ? `Lido por: ${msg.lidoPor?.join(', ')}` : 'Entregue'} className="inline-flex">
                                <CheckCheck className={`w-3.5 h-3.5 ${isRead ? 'text-sky-300 font-extrabold' : 'opacity-70'}`} />
                              </span>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {activeMessages.length === 0 && (
                <div className="text-center p-8 opacity-40 font-semibold text-xs border-2 border-dashed rounded-2xl" style={{ borderColor: 'var(--border-input)' }}>
                  Nenhuma mensagem recente neste canal. Envie um "Olá" abaixo!
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* BARRA DE RESPOSTA (REPLY PREVIEW) */}
            {replyingTo && (
              <div className="px-4 py-2 border-t flex items-center justify-between animate-in slide-in-from-bottom-2" 
                   style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
                <div className="flex items-center space-x-2 overflow-hidden border-l-4 border-blue-500 pl-2.5 py-0.5">
                  <CornerDownRight className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                  <div className="truncate text-xs">
                    <span className="font-extrabold text-blue-500 block text-[10px]">Respondendo a {replyingTo.sender}</span>
                    <span className="opacity-70 truncate block">{replyingTo.text}</span>
                  </div>
                </div>
                <button onClick={() => setReplyingTo(null)} className="p-1 rounded-lg hover:bg-black/5 cursor-pointer">
                  <X className="w-4 h-4 opacity-60" />
                </button>
              </div>
            )}

            {/* BARRA DE EMOJIS RÁPIDOS */}
            {showEmojiPicker && (
              <div className="px-4 py-2 border-t flex items-center space-x-2 overflow-x-auto"
                   style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
                {QUICK_EMOJIS.map(emoji => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => { setInputText(prev => prev + emoji); inputFieldRef.current?.focus(); }}
                    className="text-base hover:scale-125 transition-transform cursor-pointer px-1.5"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}

            {/* INPUT DE DIGITAÇÃO & TRAVA DE SEGURANÇA NO GRUPO GERAL */}
            {activeChat.name === 'Geral' && !isCurrentAdmin ? (
              <div className="p-4 border-t flex items-center justify-center bg-black/5 dark:bg-white/5" style={{ borderColor: 'var(--border-input)' }}>
                <span className="text-[11px] font-extrabold uppercase tracking-widest opacity-40 text-center">
                  Somente administradores podem enviar mensagens neste canal.
                </span>
              </div>
            ) : (
              <form onSubmit={handleSendMessage} className="p-3.5 border-t flex items-center space-x-2" style={{ borderColor: 'var(--border-input)', backgroundColor: 'var(--bg-card)' }}>
                <div className="flex items-center space-x-0.5">
                  <button type="button" onClick={() => setShowEmojiPicker(!showEmojiPicker)} className="p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 opacity-60 hover:opacity-100 cursor-pointer" title="Emojis"><Smile className="w-4 h-4" /></button>
                  <button type="button" onClick={() => imageInputRef.current?.click()} className="p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 opacity-60 hover:opacity-100 cursor-pointer" title="Enviar Imagem (Máx 10MB)"><ImageIcon className="w-4 h-4" /></button>
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 opacity-60 hover:opacity-100 cursor-pointer" title="Anexar Documento (Máx 10MB)"><Paperclip className="w-4 h-4" /></button>
                  <button type="button" onClick={() => setIsEventModalOpen(true)} className="p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 opacity-60 hover:opacity-100 cursor-pointer" title="Agendar Reunião"><Calendar className="w-4 h-4" /></button>
                </div>

                <input 
                  ref={inputFieldRef}
                  type="text" 
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Digite uma mensagem..."
                  className="flex-1 px-4 py-2.5 rounded-xl border text-xs outline-none focus:border-blue-500"
                  style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
                />
                <button type="submit" className="p-2.5 rounded-xl bg-brand-panel text-white cursor-pointer hover:opacity-90 transition-all shadow-sm">
                  <Send className="w-4 h-4" />
                </button>
              </form>
            )}

          </div>
        ) : (
          <div className="lg:col-span-9 flex flex-col items-center justify-center h-full opacity-40 space-y-3" style={{ backgroundColor: 'var(--bg-card)' }}>
            <MessageSquare className="w-12 h-12 stroke-1" />
            <p className="text-sm font-bold">Selecione ou pesquise um colaborador para conversar.</p>
          </div>
        )}

        {/* COLUNA 3: GAVETA DE INFORMAÇÕES DO CANAL / CONTATO */}
        {isInfoDrawerOpen && activeChat && (
          <div className="lg:col-span-3 border-l flex flex-col h-full overflow-hidden animate-in slide-in-from-right duration-300" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
            
            <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-input)' }}>
              <h4 className="font-extrabold text-xs">{activeChat.isDirect ? 'Dados do Contato' : 'Dados do Grupo'}</h4>
              <button onClick={() => setIsInfoDrawerOpen(false)} className="p-1.5 rounded-lg hover:bg-black/5 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 text-center border-b space-y-3" style={{ borderColor: 'var(--border-input)' }}>
              <div className="relative w-16 h-16 mx-auto rounded-3xl overflow-hidden shadow-md bg-brand-panel text-white font-extrabold flex items-center justify-center text-lg">
                {activeChat.name === 'Geral' ? (
                   <Megaphone className="w-8 h-8" />
                ) : activeChat.foto_url ? (
                  <img src={activeChat.foto_url} alt="" className="w-full h-full object-cover" />
                ) : directPeer?.avatar_url ? (
                  <img src={directPeer.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  getInitials(directPeer ? directPeer.nome : activeChat.name)
                )}
              </div>

              <div>
                <h3 className="font-extrabold text-sm">{directPeer ? directPeer.nome : activeChat.name}</h3>
                <p className="text-[11px] opacity-55 mt-0.5">
                  {activeChat.isDirect ? `${directPeer?.cargo?.toUpperCase() || 'COLABORADOR'} • Setor ${directPeer?.setor || 'Geral'}` : `Grupo • ${activeChat.members.length} membros`}
                </p>
              </div>

              {!activeChat.isDirect && isCurrentAdmin && activeChat.name !== 'Geral' && (
                <form onSubmit={handleSaveGroupPhoto} className="flex space-x-1 pt-1">
                  <input 
                    type="url"
                    value={groupPhotoUrl}
                    onChange={(e) => setGroupPhotoUrl(e.target.value)}
                    placeholder="Cole a URL da foto do grupo..."
                    className="flex-1 px-2.5 py-1.5 rounded-xl border text-[10px] outline-none"
                    style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
                  />
                  <button type="submit" className="px-3 py-1.5 rounded-xl bg-brand-panel text-white text-[10px] font-bold cursor-pointer">
                    Salvar
                  </button>
                </form>
              )}
            </div>

            <div className="flex border-b text-[11px] font-bold text-center overflow-x-auto" style={{ borderColor: 'var(--border-input)' }}>
              {!activeChat.isDirect && (
                <button onClick={() => setInfoTab('members')} className={`flex-1 py-2.5 border-b-2 cursor-pointer whitespace-nowrap px-2 ${infoTab === 'members' ? 'border-blue-500 text-blue-500' : 'border-transparent opacity-60'}`}>Membros</button>
              )}
              <button onClick={() => setInfoTab('notes')} className={`flex-1 py-2.5 border-b-2 cursor-pointer whitespace-nowrap px-2 ${infoTab === 'notes' ? 'border-blue-500 text-blue-500' : 'border-transparent opacity-60'}`}>Notas ({chatNotes.length})</button>
              <button onClick={() => setInfoTab('media')} className={`flex-1 py-2.5 border-b-2 cursor-pointer whitespace-nowrap px-2 ${infoTab === 'media' ? 'border-blue-500 text-blue-500' : 'border-transparent opacity-60'}`}>Mídias</button>
              <button onClick={() => setInfoTab('files')} className={`flex-1 py-2.5 border-b-2 cursor-pointer whitespace-nowrap px-2 ${infoTab === 'files' ? 'border-blue-500 text-blue-500' : 'border-transparent opacity-60'}`}>Arquivos</button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
              {infoTab === 'members' && !activeChat.isDirect && (
                <div className="space-y-3">
                  {isCurrentAdmin && activeChat.name !== 'Geral' && (
                    <button 
                      onClick={() => setIsAddMemberModalOpen(true)}
                      className="w-full py-2 rounded-xl bg-brand-panel text-white font-bold text-xs flex items-center justify-center space-x-1.5 cursor-pointer shadow-xs"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Adicionar Participante</span>
                    </button>
                  )}

                  <div className="space-y-2">
                    {activeChat.members.map((member, idx) => {
                      const memberProfile = teamMembers.find(m => m.user_id === member.user_id);
                      const mStatus = getRealUserStatus(memberProfile);

                      return (
                        <div key={idx} className="p-3 rounded-2xl border flex items-center justify-between text-xs" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
                          <div className="flex items-center space-x-2.5 overflow-hidden">
                            <div className="relative flex-shrink-0">
                              {memberProfile?.avatar_url ? (
                                <img src={memberProfile.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                              ) : (
                                <div className="w-7 h-7 rounded-full bg-brand-panel text-white font-bold flex items-center justify-center text-[10px]">
                                  {getInitials(member.name)}
                                </div>
                              )}
                              <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-white ${mStatus.color}`} />
                            </div>
                            <div className="truncate">
                              <p className="font-bold truncate">{member.name}</p>
                              <p className="text-[10px] opacity-50 truncate">{mStatus.label} • {member.role} {member.isAdmin ? '• Admin' : ''}</p>
                            </div>
                          </div>

                          <div className="flex items-center space-x-2">
                          {isCurrentAdmin && member.user_id !== currentUser.user_id && (
                            <button 
                              onClick={() => toggleAdminMember(member.user_id)}
                              className="text-[10px] font-extrabold text-blue-500 hover:underline cursor-pointer"
                            >
                              {member.isAdmin ? 'Tirar Admin' : 'Admin'}
                            </button>
                          )}

                          {isCurrentAdmin && member.user_id !== currentUser.user_id && activeChat.name !== 'Geral' && (
                            <button 
                              onClick={() => handleRemoveMemberFromGroup(member.user_id, member.name)}
                              className="text-red-500 hover:scale-110 cursor-pointer ml-1"
                              title="Remover do grupo"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {infoTab === 'notes' && (
                <div className="space-y-3">
                  <form onSubmit={handleAddNote} className="space-y-2">
                    <textarea 
                      rows={3}
                      value={newNoteText}
                      onChange={(e) => setNewNoteText(e.target.value)}
                      placeholder="Fixar um aviso ou nota importante na conversa..."
                      className="w-full p-2.5 rounded-xl border text-xs outline-none resize-none"
                      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
                    />
                    <button type="submit" className="w-full py-2 rounded-xl bg-brand-panel text-white font-bold text-xs cursor-pointer">
                      + Fixar Nota
                    </button>
                  </form>

                  <div className="space-y-2 pt-2">
                    {chatNotes.map(note => (
                      <div key={note.id} className="p-3 rounded-xl border text-xs space-y-1" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
                        <div className="flex justify-between font-bold opacity-70 text-[10px]">
                          <span>{note.autor_nome}</span>
                          <span>{new Date(note.created_at).toLocaleDateString('pt-BR')}</span>
                        </div>
                        <p className="leading-relaxed whitespace-pre-wrap">{note.conteudo}</p>
                      </div>
                    ))}
                    {chatNotes.length === 0 && (
                      <p className="text-center text-xs opacity-40 py-4">Nenhuma nota fixada nesta conversa.</p>
                    )}
                  </div>
                </div>
              )}

              {infoTab === 'media' && (
                <div className="grid grid-cols-2 gap-2">
                  {activeMessages.filter(m => m.type === 'image' && m.mediaUrl).map(m => (
                    <div key={m.id} className="rounded-xl overflow-hidden border aspect-square" style={{ borderColor: 'var(--border-input)' }}>
                      <img src={m.mediaUrl} alt="Mídia" className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              )}

              {infoTab === 'files' && (
                <div className="space-y-2">
                  {activeMessages.filter(m => m.type === 'file').map(m => (
                    <div key={m.id} className="p-3 rounded-xl border flex items-center space-x-2 text-xs" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
                      <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
                      <span className="truncate flex-1 font-semibold">{m.fileName}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t" style={{ borderColor: 'var(--border-input)' }}>
              <button 
                onClick={() => handleCloseChat(activeChat.id)}
                className="w-full py-2.5 rounded-xl border border-red-500/30 text-red-500 hover:bg-red-500/10 font-extrabold text-xs flex items-center justify-center space-x-2 cursor-pointer transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                <span>Encerrar / Excluir Conversa</span>
              </button>
            </div>

          </div>
        )}

      </div>

      {/* Modal Criar Grupo */}
      {isGroupModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-3xl border shadow-xl overflow-hidden" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
            
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-input)' }}>
              <h3 className="font-extrabold text-sm">Criar Novo Grupo</h3>
              <button onClick={() => setIsGroupModalOpen(false)} className="p-1.5 rounded-lg hover:bg-black/5 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateGroup} className="p-6 space-y-4 text-xs">
              <div>
                <label className="font-bold opacity-60 block mb-1">Nome do Grupo</label>
                <input 
                  type="text" 
                  required
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="Ex: Plantão TI / Bloco Cirúrgico"
                  className="w-full px-3.5 py-2.5 rounded-xl border font-semibold outline-none focus:border-blue-500"
                  style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
                />
              </div>

              <div>
                <label className="font-bold opacity-60 block mb-2">Selecionar Participantes</label>
                <div className="max-h-40 overflow-y-auto space-y-1.5 p-2 rounded-xl border" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
                  {teamMembers.filter(m => m.user_id !== currentUser.user_id).map(member => {
                    const isSelected = selectedMembersToAdd.includes(member.user_id);
                    return (
                      <label key={member.user_id} className="flex items-center justify-between p-2 rounded-lg cursor-pointer hover:bg-black/5">
                        <span className="font-bold">{member.nome} ({member.setor})</span>
                        <input 
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedMembersToAdd(prev => [...prev, member.user_id]);
                            else setSelectedMembersToAdd(prev => prev.filter(id => id !== member.user_id));
                          }}
                          className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                        />
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t" style={{ borderColor: 'var(--border-input)' }}>
                <button type="button" onClick={() => setIsGroupModalOpen(false)} className="px-4 py-2 rounded-xl border font-bold cursor-pointer hover:opacity-80" style={{ borderColor: 'var(--border-input)' }}>
                  Cancelar
                </button>
                <button type="submit" className="px-5 py-2 rounded-xl bg-brand-panel text-white font-extrabold cursor-pointer hover:opacity-90">
                  Criar Grupo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Adicionar Membro */}
      {isAddMemberModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-sm rounded-3xl border shadow-xl overflow-hidden" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
            
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-input)' }}>
              <h3 className="font-extrabold text-sm">Adicionar Participante</h3>
              <button onClick={() => setIsAddMemberModalOpen(false)} className="p-1.5 rounded-lg hover:bg-black/5 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddMemberToGroup} className="p-6 space-y-4 text-xs">
              <div>
                <label className="font-bold opacity-60 block mb-1">Escolher Colaborador</label>
                <select 
                  value={memberToAddId}
                  onChange={(e) => setMemberToAddId(e.target.value)}
                  className="w-full p-3 rounded-xl border font-bold outline-none cursor-pointer"
                  style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
                >
                  <option value="">Selecione...</option>
                  {teamMembers
                    .filter(m => !activeChat?.members.some(am => am.user_id === m.user_id))
                    .map(m => (
                      <option key={m.user_id} value={m.user_id}>{m.nome} ({m.setor})</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t" style={{ borderColor: 'var(--border-input)' }}>
                <button type="button" onClick={() => setIsAddMemberModalOpen(false)} className="px-4 py-2 rounded-xl border font-bold cursor-pointer" style={{ borderColor: 'var(--border-input)' }}>
                  Cancelar
                </button>
                <button type="submit" className="px-5 py-2 rounded-xl bg-brand-panel text-white font-extrabold cursor-pointer">
                  Adicionar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Lançar Reunião */}
      {isEventModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-3xl border shadow-xl overflow-hidden" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
            
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-input)' }}>
              <h3 className="font-extrabold text-sm">Criar Reunião no Chat</h3>
              <button onClick={() => setIsEventModalOpen(false)} className="p-1.5 rounded-lg hover:bg-black/5 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateChatEvent} className="p-6 space-y-4 text-xs">
              <div>
                <label className="font-bold opacity-60 block mb-1">Título da Reunião</label>
                <input 
                  type="text" 
                  required
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  placeholder="Ex: Alinhamento técnico..."
                  className="w-full px-3.5 py-2.5 rounded-xl border font-semibold outline-none focus:border-blue-500"
                  style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold opacity-60 block mb-1">Data</label>
                  <input 
                    type="date" 
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border font-semibold outline-none focus:border-blue-500"
                    style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
                  />
                </div>
                <div>
                  <label className="font-bold opacity-60 block mb-1">Horário</label>
                  <input 
                    type="time" 
                    value={eventTime}
                    onChange={(e) => setEventTime(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border font-semibold outline-none focus:border-blue-500"
                    style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
                  />
                </div>
              </div>

              <div>
                <label className="font-bold opacity-60 block mb-1">Local / Sala</label>
                <input 
                  type="text" 
                  value={eventLocation}
                  onChange={(e) => setEventLocation(e.target.value)}
                  placeholder="Sala de Reuniões / Meet"
                  className="w-full px-3.5 py-2.5 rounded-xl border font-semibold outline-none focus:border-blue-500"
                  style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
                />
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t" style={{ borderColor: 'var(--border-input)' }}>
                <button type="button" onClick={() => setIsEventModalOpen(false)} className="px-4 py-2 rounded-xl border font-bold cursor-pointer hover:opacity-80" style={{ borderColor: 'var(--border-input)' }}>
                  Cancelar
                </button>
                <button type="submit" className="px-5 py-2 rounded-xl bg-brand-panel text-white font-extrabold cursor-pointer hover:opacity-90">
                  Enviar Convite
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmação Personalizado */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="w-full max-w-sm rounded-3xl border shadow-2xl overflow-hidden" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-input)' }}>
              <div className="flex items-center space-x-2 text-red-500">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="font-extrabold text-sm">{confirmModal.title}</h3>
              </div>
              <button onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))} className="p-1.5 rounded-lg hover:bg-black/5 cursor-pointer opacity-50 hover:opacity-100">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6">
              <p className="text-xs font-semibold opacity-80 leading-relaxed">{confirmModal.message}</p>
            </div>
            <div className="flex justify-end space-x-2 px-6 py-4 border-t" style={{ borderColor: 'var(--border-input)', backgroundColor: 'var(--bg-input)' }}>
              <button onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))} className="px-4 py-2 rounded-xl border text-xs font-bold cursor-pointer hover:opacity-80" style={{ borderColor: 'var(--border-input)' }}>
                Cancelar
              </button>
              <button onClick={confirmModal.onConfirm} className="px-5 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs font-bold cursor-pointer shadow-sm">
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}