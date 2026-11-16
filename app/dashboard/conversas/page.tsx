'use client';
import { useSignOut } from '@/app/lib/useSignOut';

import ModalShell from '../ModalShell';
import { useDialogAction } from '../useDialogAction';

import { messageOf,occurrenceId,requireResult } from '@/app/lib/domain';
import {confirmOutgoing,pendingOutgoing,retainOutgoing} from '@/app/lib/chatOutbox';
import type { ChannelRow,Member,MessageMetadata,MessageRow } from '@/app/lib/models';
import { AlertTriangle,ArrowLeft,Calendar,Check,CheckCheck,Clock,Download,FileText,Image as ImageIcon,Loader2,LogOut,Megaphone,MessageSquare,Paperclip,Reply,Search,Send,Smile,Trash2,UserPlus,Users,X } from 'lucide-react';
import { useCallback,useEffect,useMemo,useRef,useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRecordActions } from '../useRecordActions';

type RoleType = 'administrador' | 'gestor' | 'coordenador' | 'supervisor' | 'analista' | 'colaborador';
type UserStatusType = 'online' | 'ausente' | 'ocupado' | 'indisponivel' | 'offline';

interface DBProfile { id: string; user_id: string; nome: string; email: string; cargo: RoleType; setor: string; avatar_url?: string; status_presenca?: UserStatusType; last_seen?: string; read_receipts?: boolean; }
interface ReplyInfo { id: string; sender: string; text: string; }

interface Message {
  id: string; canal_id: string; sender_id: string; sender: string; text: string; time: string; dateLabel: string; type: 'text' | 'image' | 'file' | 'event';
  status?: 'sending' | 'sent' | 'error'; mediaUrl?: string; fileName?: string; fileSize?: string; eventDetails?: { title: string; date: string; time: string; location: string };
  acceptedBy?: string[]; lidoPor?: string[]; replyTo?: ReplyInfo; created_at: string; deleted?: boolean; metadata?: MessageMetadata;
}

interface ChatChannel {
  id: string; name: string; isGroup: boolean; isDirect?: boolean; sector?: string; foto_url?: string; unread: number;
  members: { user_id: string; name: string; role: string; isAdmin: boolean }[]; lastMessage?: string; lastMessageTime?: string; updatedAt?: string;
}

interface ChatNote { id: string; canal_id: string; autor_nome: string; conteudo: string; created_at: string; }

const getInitials = (name: string) => {
  if (!name) return '..';
  const cleanName = name.replace(/^Chat:\s*/i, '').trim();
  const parts = cleanName.split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return cleanName.slice(0, 2).toUpperCase();
};

const getDateLabel = (dateStr: string) => {
  const msgDate = new Date(dateStr); const today = new Date(); const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (msgDate.toDateString() === today.toDateString()) return 'Hoje';
  if (msgDate.toDateString() === yesterday.toDateString()) return 'Ontem';
  return msgDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const formatGroupMembers = (members: Member[], currentUserId: string) => {
  const others = members.filter(m => m.user_id !== currentUserId);
  if (others.length === 0) return 'Só você';
  if (others.length === 1) return others[0].name.split(' ')[0];
  if (others.length === 2) return `${others[0].name.split(' ')[0]} e ${others[1].name.split(' ')[0]}`;
  return `${others[0].name.split(' ')[0]}, ${others[1].name.split(' ')[0]} e mais ${others.length - 2}`;
};

const mapDbToMessage = (dbMsg: MessageRow): Message => ({
  id: dbMsg.id, canal_id: dbMsg.canal_id, sender_id: dbMsg.sender_id, sender: dbMsg.sender_nome, text: dbMsg.texto, time: new Date(dbMsg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
  dateLabel: getDateLabel(dbMsg.created_at), type: dbMsg.tipo || 'text', status: 'sent', mediaUrl: dbMsg.metadata?.mediaUrl, fileName: dbMsg.metadata?.fileName, fileSize: dbMsg.metadata?.fileSize,
  eventDetails: dbMsg.metadata?.eventDetails, acceptedBy: dbMsg.metadata?.acceptedBy || [], lidoPor: dbMsg.metadata?.lidoPor || [], replyTo: dbMsg.metadata?.replyTo, created_at: dbMsg.created_at, deleted: dbMsg.metadata?.deleted || false, metadata: dbMsg.metadata
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
    lastSeenText = isToday ? `Hoje às ${timeStr}` : `Visto em ${seenDate.toLocaleDateString('pt-BR')} às ${timeStr}`;
  }
  if (profile.status_presenca === 'offline' || diffSeconds > 65) return { status: 'offline', label: 'Offline', color: 'bg-gray-400', lastSeenText };
  if (profile.status_presenca === 'ocupado') return { status: 'ocupado', label: 'Ocupado', color: 'bg-red-500', lastSeenText: 'Não perturbe' };
  if (profile.status_presenca === 'indisponivel') return { status: 'indisponivel', label: 'Indisponível', color: 'bg-purple-500', lastSeenText: 'Em atendimento' };
  if (profile.status_presenca === 'ausente' || diffSeconds > 35) return { status: 'ausente', label: 'Ausente', color: 'bg-amber-500 animate-pulse', lastSeenText };
  return { status: 'online', label: 'Online', color: 'bg-emerald-500', lastSeenText: 'Online agora' };
};

const playNotificationSound = () => {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.08, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.2); osc.onended = () => { void ctx.close(); };
  } catch { }
};

const formatLinks = (text: string) => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.split(urlRegex).map((part, i) =>
    urlRegex.test(part) ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline hover:opacity-80 transition-opacity break-words">{part}</a> : part
  );
};

// 🚀 MATRIZ DE EMOJIS RÁPIDOS
const QUICK_EMOJIS = ['👍', '✅', '🚀', '❤️', '😂', '🙏', '🔥', '👀', '⚠️', '🎉'];

export default function ConversasPage() {
  const dialogAction = useDialogAction();
  const recordActions = useRecordActions();
  const seenMessageIds = useRef(new Set<string>());
  const stickToBottom = useRef(true);
  const directRequests = useRef(new Map<string, Promise<ChannelRow>>());


  const [currentUser, setCurrentUser] = useState<DBProfile | null>(null);
  const [userStatus, setUserStatus] = useState<UserStatusType>('online');
  const [teamMembers, setTeamMembers] = useState<DBProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState(false);

  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [activeChatId, setChatSelection] = useState<string | null>(null);
  const [activeMessages, setActiveMessages] = useState<Message[]>([]);
  const [chatNotes, setChatNotes] = useState<ChatNote[]>([]);
  const [newNoteText, setNewNoteText] = useState('');
  const [photoDraft, setPhotoDraft] = useState<{id:string;value:string}|null>(null);
  const groupPhotoUrl = photoDraft?.id===activeChatId?photoDraft.value:(channels.find(c=>c.id===activeChatId)?.foto_url||'');
  const setGroupPhotoUrl = (value:string) => { if(activeChatId)setPhotoDraft({id:activeChatId,value}); };

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const inputFieldRef = useRef<HTMLTextAreaElement>(null);
  const activeChatIdRef = useRef<string | null>(null);
  const pendingChatIdRef = useRef<string | null>(null);

  useEffect(() => { activeChatIdRef.current = activeChatId; }, [activeChatId]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const cId = params.get('chatId');
      if (cId) pendingChatIdRef.current = cId;
    }
  }, []);

  const [drafts, setDrafts] = useState<Record<string,string>>({});
  const inputText = drafts[activeChatId || ''] || '';
  const setInputText = (value: React.SetStateAction<string>) => { const id=activeChatIdRef.current;if(id)setDrafts(prev=>({...prev,[id]:typeof value==='function'?value(prev[id]||''):value})); };

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
  const setActiveChatId = (action: React.SetStateAction<string|null>) => {
    const next = typeof action==='function'?action(activeChatIdRef.current):action;
    if(next!==activeChatIdRef.current){setReplyingTo(null);setShowEmojiPicker(false);setActiveMessages([]);setChatNotes([]);stickToBottom.current=true;}
    activeChatIdRef.current=next;setChatSelection(next);
  };
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void; isDestructive?: boolean }>({ isOpen: false, title: '', message: '', onConfirm: () => {}, isDestructive: false });

  // 🚀 DECLARAÇÃO DA FUNÇÃO DE NOTIFICAÇÃO
  const notifyBell = useCallback((title: string, desc: string) => {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('doodoo:notify', { detail: { title, desc } }));
  }, []);

  const handleForceLogout = useSignOut();

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => { messagesEndRef.current?.scrollIntoView({ behavior,block:'nearest' }); }, []);
  useEffect(()=>{if(stickToBottom.current)scrollToBottom('auto');},[activeMessages.length,activeChatId,scrollToBottom]);

  const updateStatusInDatabase = useCallback(async (newStatus: UserStatusType) => {
    setUserStatus(newStatus);
    if (!currentUser) return;
    await supabase.from('doodoo_perfis').update({ status_presenca: newStatus, last_seen: new Date().toISOString() }).eq('user_id', currentUser.user_id);
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const sendHeartbeat = async () => { await supabase.from('doodoo_perfis').update({ last_seen: new Date().toISOString(), status_presenca: userStatus }).eq('user_id', currentUser.user_id); };
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
    window.addEventListener('mousemove', resetTimer); window.addEventListener('keydown', resetTimer); window.addEventListener('click', resetTimer);
    resetTimer();
    return () => { clearTimeout(idleTimer); window.removeEventListener('mousemove', resetTimer); window.removeEventListener('keydown', resetTimer); window.removeEventListener('click', resetTimer); };
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
    if (!isLoading && currentUser) {
      const totalUnread = channels.reduce((acc, c) => acc + (c.unread || 0), 0);
      window.dispatchEvent(new CustomEvent('doodoo:update_unread_chat', { detail: totalUnread }));
    }
  }, [channels, isLoading, currentUser]);

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setIsLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        let perfilAtual: DBProfile | null = null;

        if (session?.user) {
          const { data } = await supabase.from('doodoo_perfis').select('*').eq('user_id', session.user.id).maybeSingle();
          perfilAtual = data;
          await supabase.from('doodoo_perfis').update({ status_presenca: 'online', last_seen: new Date().toISOString() }).eq('user_id', session.user.id);
        }

        if (!session?.user || !perfilAtual) { setAuthError(true); return; }

        if (perfilAtual) {
          setCurrentUser(perfilAtual);
          if (perfilAtual.status_presenca) setUserStatus(perfilAtual.status_presenca);

          const seteDias = new Date(); seteDias.setDate(seteDias.getDate() - 7);

          const [equipeRes, canaisRes, ultimasMsgsRes] = await Promise.all([
            supabase.from('doodoo_perfis').select('*').eq('status', 'ativo'),
            supabase.from('doodoo_canais').select('*').order('created_at', { ascending: false }),
            supabase.from('doodoo_mensagens').select('*').gte('created_at', seteDias.toISOString()).order('created_at', { ascending: false })
          ]);

          const membersList: DBProfile[] = equipeRes.data || [];
          setTeamMembers(membersList);
          const recentMsgs = ultimasMsgsRes.data || [];
          let rawChannels = canaisRes.data || [];

          if (perfilAtual.cargo === 'administrador') {
            const allMappedMembers = membersList.map(m => ({ user_id: m.user_id, name: m.nome, role: m.cargo, isAdmin: m.cargo === 'administrador' }));
            const geralDbChannel = rawChannels.find(c => c.nome === 'Geral' && c.is_group);
            if (!geralDbChannel) {
              const generalId=await occurrenceId('general');
              const { data: newGeral, error: generalError } = await supabase.from('doodoo_canais').insert([{ id:generalId, nome: 'Geral', is_group: true, setor: 'Todos', membros: allMappedMembers }]).select().single();
              if(generalError?.code==='23505'){const existing=await supabase.from('doodoo_canais').select('*').eq('id',generalId).single();if(existing.data)rawChannels=[existing.data,...rawChannels];}
              else if(generalError)notifyBell('Canal Geral indisponível','Não foi possível inicializar o canal Geral.');
              if (newGeral) rawChannels = [newGeral, ...rawChannels];
            } else {
              const currentMemberIds = Array.isArray(geralDbChannel.membros) ? geralDbChannel.membros.map((m: Member) => m.user_id) : [];
              const missingMembers = allMappedMembers.filter(m => !currentMemberIds.includes(m.user_id));
              if (missingMembers.length > 0) {
                const updatedMembers = [...(geralDbChannel.membros || []), ...missingMembers];
                await supabase.from('doodoo_canais').update({ membros: updatedMembers }).eq('id', geralDbChannel.id);
                geralDbChannel.membros = updatedMembers;
              }
            }
          }

          const targetId = pendingChatIdRef.current || (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('chatId') : null);
          let chatToFocusFirst: string | null = null;

          const mappedChannels: ChatChannel[] = rawChannels.map(c => {
            const listaMembros = Array.isArray(c.membros) ? c.membros : [];
            const peer = c.is_direct ? membersList.find((m: DBProfile) => listaMembros.some((mem: Member) => mem.user_id === m.user_id && mem.user_id !== perfilAtual?.user_id)) : null;
            const cleanName = peer ? peer.nome : (c.nome || 'Canal').replace(/^Chat:\s*/i, '');

            const msgsForThisChannel = recentMsgs.filter(m => m.canal_id === c.id);

            const unreadCount = msgsForThisChannel.filter(m => {
              const lidos = m.metadata?.lidoPor || [];
              return !lidos.includes(perfilAtual?.nome) && m.sender_id !== perfilAtual?.user_id;
            }).length;

            if (unreadCount > 0 && !chatToFocusFirst) chatToFocusFirst = c.id;

            let lastMsgText = '';
            const lastMsgObj = msgsForThisChannel[0];
            if (lastMsgObj) {
              if (lastMsgObj.metadata?.deleted) {
                lastMsgText = '🚫 Mensagem apagada';
              } else {
                lastMsgText = lastMsgObj.tipo === 'image' ? '📷 Imagem anexada' : lastMsgObj.tipo === 'file' ? `📎 ${lastMsgObj.metadata?.fileName || 'Ficheiro'}` : lastMsgObj.texto;
              }
            } else {
              lastMsgText = c.is_direct ? 'Iniciar conversa' : `${listaMembros.length} participantes`;
            }

            const lastMsgTime = lastMsgObj ? new Date(lastMsgObj.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';

            return {
              id: c.id, name: cleanName, isGroup: c.is_group, isDirect: c.is_direct, sector: c.setor, foto_url: c.foto_url,
              unread: unreadCount, members: listaMembros, lastMessage: lastMsgText, lastMessageTime: lastMsgTime, updatedAt: lastMsgObj?.created_at || c.created_at
            };
          });

          const directChatsMap = new Map<string, ChatChannel>();
          const groupChats: ChatChannel[] = [];

          mappedChannels.forEach(c => {
            if (!c.members.some(m => m.user_id === perfilAtual?.user_id)) return;
            if (c.isGroup) {
              groupChats.push(c);
            } else {
              const peer = c.members.find(m => m.user_id !== perfilAtual?.user_id);
              if (peer) {
                const existing = directChatsMap.get(peer.user_id);
                const hasMsg = recentMsgs.some(m => m.canal_id === c.id);

                if (!existing) {
                  directChatsMap.set(peer.user_id, c);
                } else {
                  const existingHasMsg = recentMsgs.some(m => m.canal_id === existing.id);
                  if (hasMsg && !existingHasMsg) {
                    directChatsMap.set(peer.user_id, c);
                  } else if (hasMsg === existingHasMsg) {
                    if (new Date(c.updatedAt || 0) > new Date(existing.updatedAt || 0)) {
                      directChatsMap.set(peer.user_id, c);
                    }
                  }
                }
              }
            }
          });

          let canaisValidos = [...groupChats, ...Array.from(directChatsMap.values())];

          canaisValidos = canaisValidos.filter(c => {
            if (c.isGroup) return true;
            if (c.id === targetId || c.id === chatToFocusFirst) return true;
            return recentMsgs.some(m => m.canal_id === c.id);
          });

          canaisValidos.sort((a, b) => {
            if (a.name === 'Geral') return -1;
            if (b.name === 'Geral') return 1;
            return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
          });

          setChannels(canaisValidos);

          // 🚀 SELECIONAR CHAT CORRETAMENTE (WhatsApp Style no Mobile)
          setActiveChatId(() => {
             // Se estamos no telemóvel E não fomos forçados por notificação, mostra a lista.
             if (typeof window !== 'undefined' && window.innerWidth < 1024 && !targetId && !window.location.search.includes('chatId')) {
                 return null;
             }

             // Se há um alvo (notificação), vai para ele
             if (targetId && canaisValidos.some(c => c.id === targetId)) return targetId;

             // Se há chats não lidos, vai para o primeiro não lido
             if (chatToFocusFirst) return chatToFocusFirst;

             // Caso contrário, vai para o "Geral" (como padrão no desktop)
             const geral = canaisValidos.find(c => c.name === 'Geral');
             return geral ? geral.id : (canaisValidos.length > 0 ? canaisValidos[0].id : null);
          });

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
  }, [notifyBell]);

  // 🚀 Dispara evento global para que o layout.tsx esconda a Bottom Nav se estivermos num chat no mobile
  useEffect(() => {
     if (typeof window !== 'undefined') {
        const isMobileChatActive = window.innerWidth < 1024 && activeChatId !== null;
        window.dispatchEvent(new CustomEvent('doodoo:mobile_chat_state', { detail: { isInsideChat: isMobileChatActive } }));
     }
  }, [activeChatId]);

  useEffect(() => {
    const handleSwitchChat = async (event: Event) => {
      const id = (event as CustomEvent<{chatId:string}>).detail.chatId;
      if (!id) return;

      if (channels.length > 0) {
        if (channels.some(c => c.id === id)) {
          setActiveChatId(id);
          if (typeof window !== 'undefined') window.history.replaceState(null, '', `/dashboard/conversas?chatId=${id}`);
        } else {
          const { data: missingChannel } = await supabase.from('doodoo_canais').select('*').eq('id', id).single();
          if (missingChannel) {
             const peer = missingChannel.is_direct ? missingChannel.membros.find((m: Member) => m.user_id !== currentUser?.user_id) : null;
             const peerProfile = teamMembers.find(m => m.user_id === peer?.user_id);
             const cleanName = peerProfile ? peerProfile.nome : missingChannel.nome;

             const mapped: ChatChannel = {
                id: missingChannel.id, name: cleanName, isGroup: missingChannel.is_group, isDirect: missingChannel.is_direct, sector: missingChannel.setor,
                foto_url: missingChannel.foto_url, unread: 0, members: missingChannel.membros, lastMessage: 'Nova conversa iniciada',
                lastMessageTime: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), updatedAt: new Date().toISOString()
             };
             setChannels(prev => [mapped, ...prev].sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()));
             setActiveChatId(id);
             if (typeof window !== 'undefined') window.history.replaceState(null, '', `/dashboard/conversas?chatId=${id}`);
          }
        }
      } else {
        pendingChatIdRef.current = id;
      }
    };

    window.addEventListener('doodoo:switch_chat', handleSwitchChat);
    return () => window.removeEventListener('doodoo:switch_chat', handleSwitchChat);
  }, [channels, currentUser, teamMembers]);

  const mergeMetadata = useCallback(async (id:string, transform:(value:MessageMetadata)=>MessageMetadata) => {
    for(let attempt=0;attempt<3;attempt++){
      const row=requireResult<MessageRow>(await supabase.from('doodoo_mensagens').select('*').eq('id',id).single());
      const before=row.metadata || {};
      const query=supabase.from('doodoo_mensagens').update({metadata:transform(before)}).eq('id',id);
      const result=await (row.metadata==null?query.is('metadata',null):query.filter('metadata','eq',JSON.stringify(before))).select('*').maybeSingle();
      if(result.error)throw result.error;if(result.data)return mapDbToMessage(result.data);
    }
    throw new Error('A mensagem foi alterada em outra sessão. Tente novamente.');
  },[]);
  const fetchMessagesForActiveChannel = useCallback((channelId: string) => {
    const seteDias = new Date();
    seteDias.setDate(seteDias.getDate() - 7);

    return supabase
      .from('doodoo_mensagens')
      .select('*')
      .eq('canal_id', channelId)
      .gte('created_at', seteDias.toISOString())
      .order('created_at', { ascending: true }).then(async ({data:msgData,error:messagesError}) => {

    if (activeChatIdRef.current !== channelId) return;
    if(messagesError){
      if(currentUser)setActiveMessages(pendingOutgoing(currentUser.user_id).filter(m=>m.canal_id===channelId).map(m=>({...mapDbToMessage(m),status:'error'})));
      notifyBell('Mensagens indisponíveis','Não foi possível carregar esta conversa.');return;
    }
    if (msgData) {
      msgData.forEach(m=>seenMessageIds.current.add(m.id));
      const mapped = msgData.map(mapDbToMessage);
      const pending=currentUser?pendingOutgoing(currentUser.user_id).filter(m=>m.canal_id===channelId):[];
      if(currentUser)confirmOutgoing(currentUser.user_id,msgData.map(row=>row.id));

      setActiveMessages(prev => {
        const pendingOptimistic = prev.filter(m => m.status === 'sending' && m.canal_id === channelId);
        const recovered=pending.filter(row=>!mapped.some(m=>m.id===row.id)).map(row=>({...mapDbToMessage(row),status:'error' as const}));
        const filteredOptimistic = pendingOptimistic.filter(opt => !mapped.some(dbm => dbm.id === opt.id)&&!recovered.some(row=>row.id===opt.id));
        return [...mapped, ...recovered, ...filteredOptimistic];
      });

      if (currentUser) {
        const unreadMsgs = msgData.filter(m => {
          const lidos = m.metadata?.lidoPor || [];
          return !lidos.includes(currentUser.nome) && m.sender_id !== currentUser.user_id;
        });

        if (unreadMsgs.length > 0) {
          if (currentUser.read_receipts === true) {
             const result=await Promise.allSettled(unreadMsgs.map(m=>mergeMetadata(m.id,value=>({...value,lidoPor:Array.from(new Set([...(value.lidoPor||[]),currentUser.nome]))}))));
             if(result.every(r=>r.status==='fulfilled'))setChannels(prev=>prev.map(c=>c.id===channelId?{...c,unread:0}:c));
             else notifyBell('Leitura não sincronizada','Não foi possível confirmar todas as leituras. Tente reconectar.');
          } else {
             setChannels(prev => prev.map(c => c.id === channelId ? { ...c, unread: 0 } : c));
          }
        } else {
          setChannels(prev => prev.map(c => c.id === channelId ? { ...c, unread: 0 } : c));
        }
      }
    }
    });
  }, [currentUser, mergeMetadata, notifyBell]);

  useEffect(() => {
    if (!activeChatId) return;



    if (!activeChatId.startsWith('temp_chat_')) {
      fetchMessagesForActiveChannel(activeChatId).then(() => scrollToBottom('auto'));
      supabase.from('doodoo_chat_notas').select('*').eq('canal_id', activeChatId).order('created_at', { ascending: false }).then(({ data }) => {
        if (data && activeChatIdRef.current===activeChatId) setChatNotes(data as ChatNote[]);
      });
    }
  }, [activeChatId, fetchMessagesForActiveChannel, scrollToBottom]);



  useEffect(() => {
    if (!currentUser) return;

    const channelName = `chat_sync_${currentUser.user_id}_${Math.random().toString(36).substring(7)}`;

    const globalSub = supabase
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'doodoo_mensagens' }, (payload) => {
        const incoming = mapDbToMessage(payload.new as unknown as MessageRow);
        if(seenMessageIds.current.has(incoming.id))return;seenMessageIds.current.add(incoming.id);
        const currentActiveId = activeChatIdRef.current;

        setChannels(prev => {
           const updatedChannels = prev.map(c => {
             if (c.id === incoming.canal_id) {
               const isCurrentlyOpen = c.id === currentActiveId;
               return {
                 ...c,
                 lastMessage: incoming.deleted ? '🚫 Apagada' : incoming.type === 'image' ? '📷 Imagem anexada' : incoming.type === 'file' ? `📎 Ficheiro anexado` : incoming.text,
                 lastMessageTime: incoming.time,
                 unread: isCurrentlyOpen ? 0 : incoming.sender_id === currentUser.user_id ? c.unread : (c.unread || 0) + 1,
                 updatedAt: incoming.created_at
               };
             }
             return c;
           });

           return updatedChannels.sort((a, b) => {
             if (a.name === 'Geral') return -1;
             if (b.name === 'Geral') return 1;
             return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
           });
        });

        if (incoming.canal_id === currentActiveId) {
          setActiveMessages(prev => {
            if (prev.some(m => m.id === incoming.id)) return prev;
            return [...prev, incoming];
          });

          if (incoming.sender_id !== currentUser.user_id) {
            playNotificationSound();
            if (currentUser.read_receipts === true) {
               void mergeMetadata(incoming.id,value=>({...value,lidoPor:Array.from(new Set([...(value.lidoPor||[]),currentUser.nome]))})).catch(()=>notifyBell('Leitura não sincronizada','Não foi possível confirmar a leitura desta mensagem.'));
            }
          }
          if(stickToBottom.current)scrollToBottom('smooth');
        } else if (incoming.sender_id !== currentUser.user_id) {
          playNotificationSound();
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'doodoo_mensagens' }, (payload) => {
        const updated = mapDbToMessage(payload.new as unknown as MessageRow);
        if (updated.canal_id === activeChatIdRef.current) setActiveMessages(prev => prev.map(m => m.id === updated.id ? updated : m));

        setChannels(prev => prev.map(c => {
           if (c.id === updated.canal_id) {
              return { ...c, lastMessage: updated.deleted ? '🚫 Mensagem apagada' : c.lastMessage };
           }
           return c;
        }));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'doodoo_mensagens' }, (payload) => {
        const deletedId = payload.old?.id || (payload.old as {old_record?:{id:string}})?.old_record?.id;
        if (deletedId) setActiveMessages(prev => prev.filter(m => m.id !== deletedId));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'doodoo_perfis' }, (payload) => {
        const updatedProfile = payload.new as DBProfile;
        setTeamMembers(prev => prev.map(m => m.user_id === updatedProfile.user_id ? { ...m, ...updatedProfile } : m));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'doodoo_canais' }, (payload) => {
        const newChannel = payload.new;
        if (Array.isArray(newChannel.membros) && newChannel.membros.some((m: Member) => m.user_id === currentUser.user_id)) {
          setChannels(prev => {
            if (prev.some(c => c.id === newChannel.id)) return prev;
            const peer = newChannel.is_direct ? newChannel.membros.find((m: Member) => m.user_id !== currentUser.user_id) : null;
            const cleanName = peer ? peer.name : (newChannel.nome || 'Canal').replace(/^Chat:\s*/i, '');
            const mapped: ChatChannel = {
              id: newChannel.id, name: cleanName, isGroup: newChannel.is_group, isDirect: newChannel.is_direct, sector: newChannel.setor,
              foto_url: newChannel.foto_url, unread: 1, members: newChannel.membros, lastMessage: 'Conversa iniciada',
              lastMessageTime: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), updatedAt: newChannel.created_at
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
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'doodoo_canais' }, (payload) => {
        const updated = payload.new;
        setChannels(prev => prev.map(c => c.id === updated.id ? { ...c, foto_url: updated.foto_url, members: updated.membros, name: c.isDirect ? c.name : updated.nome } : c));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'doodoo_canais' }, (payload) => {
        const deletedId = payload.old?.id || (payload.old as {old_record?:{id:string}})?.old_record?.id;
        if (deletedId) {
          setChannels(prev => prev.filter(c => c.id !== deletedId));
          if (activeChatIdRef.current === deletedId) { setActiveChatId(null); setIsInfoDrawerOpen(false); }
        }
      })
      .subscribe(status=>{const id=activeChatIdRef.current;if(status==='SUBSCRIBED'&&id&&!id.startsWith('temp_chat_'))void fetchMessagesForActiveChannel(id);});

    return () => { supabase.removeChannel(globalSub); };
  }, [currentUser, scrollToBottom, mergeMetadata, notifyBell, fetchMessagesForActiveChannel]);

  const resolveChannel = async (requestedId:string) => {
    if(!currentUser||!requestedId)throw new Error('Selecione uma conversa válida.');
    let targetChannelId=requestedId;
    if(targetChannelId.startsWith('temp_chat_')) {
      const temporaryId=targetChannelId;
      const channel=channels.find(c=>c.id===temporaryId);if(!channel)throw new Error('Conversa indisponível');
      if(!directRequests.current.has(temporaryId))directRequests.current.set(temporaryId,(async()=>{
        const id=await occurrenceId('direct:'+channel.members.map(m=>m.user_id).sort().join(':'));
        const result=await supabase.from('doodoo_canais').insert({id,nome:channel.name,is_group:false,is_direct:true,membros:channel.members}).select('*').single();
        if(result.error?.code==='23505')return requireResult<ChannelRow>(await supabase.from('doodoo_canais').select('*').eq('id',id).single());
        return requireResult<ChannelRow>(result);
      })());
      try {
        const saved=await directRequests.current.get(temporaryId)!;targetChannelId=saved.id;
        setChannels(prev=>prev.map(c=>c.id===temporaryId?{...c,id:saved.id}:c));
        setDrafts(prev=>({...prev,[saved.id]:prev[temporaryId]||prev[saved.id]||''}));
        if(activeChatIdRef.current===temporaryId){setActiveChatId(saved.id);window.history.replaceState(null,'','/dashboard/conversas?chatId='+saved.id);}
      }catch{directRequests.current.delete(temporaryId);throw new Error('Não foi possível iniciar a conversa. Seu conteúdo foi preservado.');}
    }
    return targetChannelId;
  };
  const sendToDatabase = async (tipo: 'text' | 'image' | 'file' | 'event', texto: string, metadata: MessageMetadata = {}, retryId?: string, requestedChannelId = activeChatIdRef.current) => {
    if (!currentUser || !requestedChannelId) return false;

    let targetChannelId = requestedChannelId;
    const timeFormatted = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const nowIso = new Date().toISOString();
    const tempId = retryId || crypto.randomUUID();
    const replyData = retryId ? metadata.replyTo : replyingTo ? { id: replyingTo.id, sender: replyingTo.sender, text: replyingTo.text } : undefined;

    try { targetChannelId=await resolveChannel(targetChannelId); } catch { notifyBell('Conversa não iniciada','Seu conteúdo foi preservado. Tente novamente.');return false; }

    const optimisticMsg: Message = {
      id: tempId, canal_id: targetChannelId, sender_id: currentUser.user_id, sender: currentUser.nome,
      text: texto, time: timeFormatted, dateLabel: 'Hoje', type: tipo, status: 'sending',
      mediaUrl: metadata.mediaUrl, fileName: metadata.fileName, fileSize: metadata.fileSize,
      eventDetails: metadata.eventDetails, acceptedBy: [], lidoPor: [currentUser.nome], replyTo: replyData, created_at: nowIso,
      metadata: { ...metadata, lidoPor: [currentUser.nome], replyTo: replyData }
    };

    if(activeChatIdRef.current===targetChannelId)setActiveMessages(prev => [...prev.filter(m=>m.id!==tempId), optimisticMsg]);
    setReplyingTo(null); setShowEmojiPicker(false); scrollToBottom('smooth');

    setChannels(prev => prev.map(c => c.id === targetChannelId ? {
      ...c, lastMessage: tipo === 'text' ? `Você: ${texto}` : 'Você enviou um anexo', lastMessageTime: timeFormatted, updatedAt: nowIso
    } : c).sort((a, b) => {
       if (a.name === 'Geral') return -1;
       if (b.name === 'Geral') return 1;
       return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
    }));

    const outgoing:MessageRow={
        id: tempId, canal_id: targetChannelId, sender_id: currentUser.user_id, sender_nome: currentUser.nome, texto: texto, tipo: tipo,
        metadata: { ...metadata, lidoPor: [currentUser.nome], replyTo: replyData },created_at:nowIso
    };
    const recoverable=retainOutgoing(currentUser.user_id,outgoing);
    let { data, error } = await supabase.from('doodoo_mensagens').insert([{...outgoing,created_at:undefined}]).select().single();

    if(error?.code==='23505'){const existing=await supabase.from('doodoo_mensagens').select('*').eq('id',tempId).single();if(existing.data?.sender_id===currentUser.user_id&&existing.data?.canal_id===targetChannelId&&existing.data?.texto===texto){data=existing.data;error=null;}}
    if (data && !error) {
      confirmOutgoing(currentUser.user_id,tempId);
      const confirmedMsg = mapDbToMessage(data);
      setActiveMessages(prev => {
        if(activeChatIdRef.current!==targetChannelId)return prev;
        if (!prev.some(m => m.id === tempId)) return [...prev,confirmedMsg];
        return prev.map(m => m.id === tempId ? confirmedMsg : m);
      });
      return true;
    } else {
      setActiveMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'error' } : m));
      notifyBell('Falha no Envio', recoverable?'Não foi possível entregar a mensagem. Seu texto foi preservado.':'Não foi possível entregar nem salvar no dispositivo. Mantenha o chat aberto para tentar novamente.');
      return false;
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || !activeChatId) return;
    const textToSend = inputText.trim();
    setInputText('');
    if (inputFieldRef.current) inputFieldRef.current.style.height = 'auto';
    const id=activeChatIdRef.current;
    if(!await sendToDatabase('text',textToSend,{},undefined,id)&&id)setDrafts(prev=>({...prev,[id]:prev[id]?prev[id]+'\n'+textToSend:textToSend}));
  };

  const handleInputResize = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (inputText.trim()) handleSendMessage();
    }
  };

  // 🚀 ADICIONAR EMOJI AO TEXTO E FOCAR NO INPUT
  const handleEmojiSelect = (emoji: string) => {
    setInputText(prev => prev + emoji);
    if (inputFieldRef.current) {
      inputFieldRef.current.focus();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'file') => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;
    if (file.size > 10 * 1024 * 1024) return notifyBell('Erro', 'O arquivo excede o limite de 10 MB.');

    try {
      notifyBell('Enviando...', 'A transferir o seu anexo para o servidor.');
      const ext = file.name.split('.').pop();
      const channelId = await resolveChannel(activeChatIdRef.current || '');
        const userId = currentUser.user_id;

        const filePath =
          `${channelId}/${userId}/${type}s/${crypto.randomUUID()}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from('chat_midia')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) throw uploadError;

        const { data: signedUrlData, error: signedUrlError } =
          await supabase.storage
            .from('chat_midia')
            .createSignedUrl(filePath, 15 * 60);

        if (signedUrlError) notifyBell('Prévia indisponível','O arquivo será anexado pelo identificador. Abra o anexo para tentar renovar o acesso.');

        const fileUrl = signedUrlData?.signedUrl || '';
      const fileSize = `${(file.size / (1024 * 1024)).toFixed(1)} MB`;

      if (type === 'image') await sendToDatabase('image', 'Imagem anexada', { mediaUrl: fileUrl, storagePath:filePath, fileSize }, undefined, channelId);
      else await sendToDatabase('file', file.name, { fileName: file.name, fileSize, mediaUrl: fileUrl, storagePath:filePath }, undefined, channelId);
    } catch {
      notifyBell('Erro de Envio', 'Não foi possível fazer o upload. O serviço pode estar indisponível.');
    } finally {
      e.target.value = '';
    }
  };

  const openAttachment=async(event:React.MouseEvent<HTMLAnchorElement>,message:Message)=>{
    if(!message.metadata?.storagePath)return;
    event.preventDefault();
    const target=window.open('about:blank','_blank');
    if(target)target.opener=null;
    try{
      const path=message.metadata.storagePath;
      if(!path.startsWith(message.canal_id+'/'+message.sender_id+'/')||path.includes('..'))throw new Error('Referência de anexo inválida.');
      const signed=requireResult(await supabase.storage.from('chat_midia').createSignedUrl(path,15*60,{download:event.currentTarget.hasAttribute('download')?(message.fileName||true):false}));
      if(!target)throw new Error('Permita abrir uma nova aba para acessar o arquivo.');
      target.location.replace(signed.signedUrl);
    }catch(error){target?.close();notifyBell('Anexo indisponível',messageOf(error));}
  };

  const confirmDeleteMessage = (msgId: string) => {
    setConfirmModal({
      isOpen: true, title: 'Apagar Mensagem', message: 'Tem a certeza que pretende eliminar esta mensagem para todos os participantes?', isDestructive: true,
      onConfirm: async () => {
        const previous=activeMessages.find(m=>m.id===msgId);if(previous?.sender_id!==currentUser?.user_id)return;
        const saved=await mergeMetadata(msgId,value=>({...value,deleted:true}));
        setActiveMessages(prev=>prev.map(m=>m.id===msgId?saved:m));
        setConfirmModal(prev=>({...prev,isOpen:false}));
        notifyBell('Ação Concluída', 'A mensagem foi eliminada do histórico.');
      }
    });
  };

  const handleCloseChat = async (channelId: string) => {
    if (channels.find(c => c.id === channelId)?.name === 'Geral') return notifyBell('Ação Bloqueada', 'O canal Geral da empresa não pode ser excluído.');

    setConfirmModal({
      isOpen: true, title: 'Excluir Conversa', message: 'Deseja excluir esta conversa da sua lista de chats? O histórico será ocultado até que receba uma nova mensagem.', isDestructive: true,
      onConfirm: async () => {
        if (!currentUser) return;

        try {
          if (!channelId.startsWith('temp_chat_')) {
            const channel=requireResult(await supabase.from('doodoo_canais').select('*').eq('id',channelId).single()) as ChannelRow;
            const updatedMembers=(channel.membros||[]).filter(m=>m.user_id!==currentUser.user_id);
            if(updatedMembers.length&&!updatedMembers.some(m=>m.isAdmin))throw new Error('Promova outro administrador antes de sair do grupo.');
            requireResult(await (updatedMembers.length===0 ? supabase.from('doodoo_canais').delete().eq('id',channelId) : supabase.from('doodoo_canais').update({membros:updatedMembers}).eq('id',channelId)).filter('membros','eq',JSON.stringify(channel.membros)).select().single());
          }
          setChannels(prev=>prev.filter(c=>c.id!==channelId));
          setActiveChatId(null);setIsInfoDrawerOpen(false);setConfirmModal(prev=>({...prev,isOpen:false}));
        } catch(error) { notifyBell('Falha ao remover conversa',messageOf(error)); }

      }
    });
  };

  const handleCreateChatEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventTitle.trim()) return;
    const sent = await sendToDatabase('event', `Reunião: ${eventTitle}`, {
      eventDetails: { title: eventTitle.trim(), date: eventDate ? eventDate.split('-').reverse().join('/') : 'Hoje', time: eventTime, location: eventLocation.trim() || 'Online' },
      acceptedBy: []
    });
    if(sent){setIsEventModalOpen(false); setEventTitle('');}
  };

  const handleAcceptChatEvent = async (message:Message) => {
    if(!currentUser)return;
    await recordActions.run(message.id,async()=>{
      const saved=await mergeMetadata(message.id,value=>({...value,acceptedBy:Array.from(new Set([...(value.acceptedBy||[]),currentUser.nome]))}));
      setActiveMessages(prev=>prev.map(m=>m.id===message.id?saved:m));
    });
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim() || !currentUser) return;
    if (newGroupName.trim().toLowerCase() === 'geral') return notifyBell('Nome Inválido', 'Já existe um canal reservado com este nome.');
    const membrosIniciais = [{ user_id: currentUser.user_id, name: currentUser.nome, role: currentUser.cargo, isAdmin: true }, ...teamMembers.filter(m => selectedMembersToAdd.includes(m.user_id)).map(m => ({ user_id: m.user_id, name: m.nome, role: m.cargo, isAdmin: false }))];
    const { data, error } = await supabase.from('doodoo_canais').insert([{ nome: newGroupName.trim(), is_group: true, setor: currentUser.setor, membros: membrosIniciais }]).select().single();
    if (error || !data) {notifyBell('Grupo não criado',error?.message||'Tente novamente.');return;}
    if (data) {
      const newGroup: ChatChannel = { id: data.id, name: data.nome, isGroup: data.is_group, sector: data.setor, unread: 0, members: data.membros, lastMessage: 'Grupo criado com sucesso.', lastMessageTime: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) };
      setChannels(prev => [newGroup, ...prev.filter(c=>c.id!==newGroup.id)]);
      setActiveChatId(data.id);
      if (typeof window !== 'undefined') window.history.replaceState(null, '', `/dashboard/conversas?chatId=${data.id}`);
      setIsGroupModalOpen(false);
      await supabase.from('doodoo_mensagens').insert([{ canal_id: data.id, sender_id: currentUser.user_id, sender_nome: currentUser.nome, texto: `O grupo "${newGroupName}" foi criado.`, tipo: 'text' }]);
      setNewGroupName(''); setSelectedMembersToAdd([]);
    }
  };

  const handleOpenDirectChat = async (colab: DBProfile) => {
    if (!currentUser || colab.user_id === currentUser.user_id) return;
    const existingChat = channels.find(c => c.isDirect && c.members.some(m => m.user_id === colab.user_id) && !c.id.startsWith('temp_chat_'));
    if (existingChat) {
      setActiveChatId(existingChat.id);
      if (typeof window !== 'undefined') window.history.replaceState(null, '', `/dashboard/conversas?chatId=${existingChat.id}`);
      setSearchQuery('');
      return;
    }
    const tempId = `temp_chat_${colab.user_id}`;
    if (channels.find(c => c.id === tempId)) {
      setActiveChatId(tempId);
      if (typeof window !== 'undefined') window.history.replaceState(null, '', `/dashboard/conversas?chatId=${tempId}`);
      setSearchQuery('');
      return;
    }
    const membrosDiretos = [{ user_id: currentUser.user_id, name: currentUser.nome, role: currentUser.cargo, isAdmin: true }, { user_id: colab.user_id, name: colab.nome, role: colab.cargo, isAdmin: true }];
    const newDirect: ChatChannel = { id: tempId, name: colab.nome, isGroup: false, isDirect: true, unread: 0, members: membrosDiretos, lastMessage: 'Iniciar conversa...', lastMessageTime: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) };
    setChannels(prev => [newDirect, ...prev]);
    setActiveChatId(tempId);
    if (typeof window !== 'undefined') window.history.replaceState(null, '', `/dashboard/conversas?chatId=${tempId}`);
    setSearchQuery('');
  };

  const mutateMembers=async(id:string,transform:(members:Member[])=>Member[])=>recordActions.run('members:'+id,async()=>{
    for(let attempt=0;attempt<3;attempt++){
      const live=requireResult<ChannelRow>(await supabase.from('doodoo_canais').select('*').eq('id',id).single());
      if(!live.membros.some(m=>m.user_id===currentUser?.user_id&&m.isAdmin))throw new Error('Você não administra mais este grupo.');
      const members=transform(live.membros);
      if(members.length&&!members.some(m=>m.isAdmin))throw new Error('Mantenha ao menos um administrador no grupo.');
      const result=await supabase.from('doodoo_canais').update({membros:members}).eq('id',id).filter('membros','eq',JSON.stringify(live.membros)).select('*').maybeSingle();
      if(result.error)throw result.error;if(!result.data)continue;
      setChannels(prev=>prev.map(c=>c.id===id?{...c,members:result.data.membros}:c));return true;
    }
    throw new Error('Os membros mudaram em outra sessão. Tente novamente.');
  });
  const handleAddMemberToGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberToAddId || !activeChat || !isCurrentAdmin) return;
    const userToAdd = teamMembers.find(m => m.user_id === memberToAddId);
    if (!userToAdd || activeChat.members.some(m => m.user_id === memberToAddId)) return;
    const saved=await mutateMembers(activeChat.id,members=>members.some(m=>m.user_id===userToAdd.user_id)?members:[...members,{user_id:userToAdd.user_id,name:userToAdd.nome,role:userToAdd.cargo,isAdmin:false}]);
    if(saved){setIsAddMemberModalOpen(false); setMemberToAddId('');}
  };

  const handleRemoveMemberFromGroup = (targetUserId: string, targetName: string) => {
    if (!activeChat || !isCurrentAdmin) return;
    if (activeChat.name === 'Geral') return notifyBell('Ação Bloqueada', 'Não é permitido remover colaboradores do grupo Geral da empresa.');
    setConfirmModal({
      isOpen: true, title: 'Remover Colaborador', message: `Tem certeza que deseja remover ${targetName} do grupo?`, isDestructive: true,
      onConfirm: async () => {
        if(await mutateMembers(activeChat.id,members=>members.filter(m=>m.user_id!==targetUserId)))setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const toggleAdminMember = async (targetUserId: string) => {
    if (!activeChat || !isCurrentAdmin) return;
    await mutateMembers(activeChat.id,members=>members.map(m=>m.user_id===targetUserId?{...m,isAdmin:!m.isAdmin}:m));
  };

  const handleSaveGroupPhoto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChat) return;
    const saved=requireResult<ChannelRow>(await supabase.from('doodoo_canais').update({ foto_url: groupPhotoUrl.trim() }).eq('id', activeChat.id).select('*').single());
    setChannels(prev=>prev.map(c=>c.id===activeChat.id?{...c,foto_url:saved.foto_url}:c));
    notifyBell('Foto Salva', 'A imagem do grupo foi atualizada.');
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteText.trim() || !activeChatId || !currentUser) return;
    const textoNota = newNoteText.trim();
    const { data, error } = await supabase.from('doodoo_chat_notas').insert([{ canal_id: activeChatId, autor_nome: currentUser.nome, conteudo: textoNota }]).select().single();
    if(error){notifyBell('Aviso não salvo','O conteúdo permanece no campo para tentar novamente.');return;}
    if (data) {setChatNotes(prev => [data as ChatNote, ...prev]);setNewNoteText('');}
  };

  const filteredTeamMembers = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return teamMembers.filter(m => m.user_id !== currentUser?.user_id && (m.nome.toLowerCase().includes(searchQuery.toLowerCase()) || m.setor.toLowerCase().includes(searchQuery.toLowerCase())));
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
    return activeMessages.filter(m => m.text.toLowerCase().includes(messageSearch.toLowerCase()) || m.sender.toLowerCase().includes(messageSearch.toLowerCase()));
  }, [activeMessages, messageSearch]);

  if (isLoading) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin opacity-70 text-brand-panel" />
      </div>
    );
  }

  if (authError || !currentUser) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center space-y-5 animate-in fade-in zoom-in-95 duration-300">
        <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center">
          <AlertTriangle className="w-10 h-10 text-[var(--error-text)] opacity-80" />
        </div>
        <div className="text-center space-y-1.5">
          <h3 className="text-xl font-semibold tracking-tight">Sessão Expirada</h3>
          <p className="text-xs font-medium opacity-75 max-w-sm mx-auto leading-relaxed">Não foi possível validar as suas credenciais no Chat Corporativo.</p>
        </div>
        <button onClick={handleForceLogout} className="mt-2 px-6 py-3 rounded-2xl bg-brand-panel text-white text-xs font-semibold cursor-pointer flex items-center space-x-2 shadow-sm hover:scale-105 transition-transform">
          <LogOut className="w-4 h-4" /><span>Fazer Login Novamente</span>
        </button>
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-0 min-w-0 flex-1 flex flex-col animate-in fade-in duration-500 pb-0 relative z-0">

      <input type="file" ref={imageInputRef} onChange={(e) => handleFileUpload(e, 'image')} accept="image/*" className="hidden" />
      <input type="file" ref={fileInputRef} onChange={(e) => handleFileUpload(e, 'file')} accept=".pdf,.doc,.docx,.xls,.xlsx,.txt" className="hidden" />

      {/* 🚀 LAYOUT RESPONSIVO WHATSAPP STYLE */}
      <div className="w-full flex-1 flex flex-col lg:flex-row rounded-xl rounded-bl-none rounded-br-none md:rounded-xl md:rounded-xl border-t border-l-0 border-r-0 border-b-0 md:border overflow-hidden relative z-10" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-input)', boxShadow: '0 12px 40px rgba(0, 0, 0, 0.08)' }}>

        {/* COLUNA 1: LISTA DE CONVERSAS */}
        <div className={`flex flex-col w-full lg:w-[320px] xl:w-[380px] flex-shrink-0 border-r transition-all duration-300 ${activeChatId ? 'hidden lg:flex' : 'flex'}`} style={{ backgroundColor: 'var(--bg-input)', borderRight: '1px solid var(--border-input)' }}>

          <div className="space-y-4 p-5 md:p-6 pb-4">
            <div className="space-y-4 pb-4 border-b" style={{ borderColor: 'var(--border-input)' }}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-base md:text-lg tracking-tight">Chat Corporativo</h3>
                  <p className="text-xs font-medium uppercase tracking-widest opacity-45 mt-0.5">Sincronizado</p>
                </div>
              </div>

              <div className="flex items-center justify-between px-4 py-3 rounded-2xl border text-sm font-semibold shadow-sm" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-input)' }}>
                <div className="flex items-center space-x-3 truncate">
                  <span className={`w-3.5 h-3.5 rounded-full flex-shrink-0 shadow-sm ${userStatus === 'online' ? 'bg-emerald-500' : userStatus === 'ausente' ? 'bg-amber-500 animate-pulse' : userStatus === 'ocupado' ? 'bg-red-500' : userStatus === 'indisponivel' ? 'bg-purple-500' : 'bg-gray-400'}`} />
                  <span className="truncate flex-1">{currentUser.nome}</span>
                </div>
                <select value={userStatus} onChange={e => updateStatusInDatabase(e.target.value as UserStatusType)} className="bg-transparent text-xs uppercase font-semibold outline-none cursor-pointer opacity-70 hover:opacity-100 flex-shrink-0">
                  <option value="online">Online</option><option value="ausente">Ausente</option><option value="ocupado">Ocupado</option><option value="indisponivel">Indisponível</option><option value="offline">Offline</option>
                </select>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-widest opacity-70 px-1">Canais e Diretos</span>
                <button onClick={() => setIsGroupModalOpen(true)} className="text-xs font-semibold text-brand-panel hover:text-blue-600 flex items-center space-x-1 cursor-pointer transition-colors">
                  <Users className="w-3.5 h-3.5" /><span>+ Novo Grupo</span>
                </button>
              </div>
              <div className="relative w-full">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 opacity-70" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Iniciar ou procurar conversa..."
                  className="w-full pl-10 pr-4 py-3.5 rounded-2xl border text-sm font-medium outline-none focus:border-brand-panel transition-colors shadow-sm"
                  style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-main)' }}
                />
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 pb-5 md:px-6 custom-scrollbar space-y-1.5">
            {searchQuery.trim() !== '' && filteredTeamMembers.length > 0 && (
              <div className="mb-4">
                <span className="text-xs font-semibold uppercase tracking-wider opacity-70 px-2 mb-3 block">Colaboradores</span>
                {filteredTeamMembers.map(colab => {
                  const peerStatus = getRealUserStatus(colab);
                  return (
                    <button key={colab.user_id} onClick={() => handleOpenDirectChat(colab)} className="w-full text-left p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center space-x-3.5 my-1.5 bg-black/5 dark:bg-white/5 border-transparent hover:bg-black/10 dark:hover:bg-white/10 shadow-sm hover:scale-[1.01]">
                      <div className="relative flex-shrink-0">
                        {colab.avatar_url ? <img src={colab.avatar_url} alt="" className="w-10 h-10 rounded-xl object-cover shadow-sm border border-white/20" /> : <div className="w-10 h-10 rounded-xl bg-brand-panel text-white font-semibold flex items-center justify-center text-[12px] shadow-sm">{getInitials(colab.nome)}</div>}
                        <span className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm ${peerStatus.color}`} />
                      </div>
                      <div className="truncate flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{colab.nome}</p>
                        <p className="text-xs opacity-75 font-medium truncate uppercase mt-1 tracking-wider">{colab.setor} • {peerStatus.label}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {filteredChannels.map(chat => {
              const isActive = chat.id === activeChatId;
              const isGeneralGroup = chat.name === 'Geral';
              const peerForChannel = chat.isDirect ? teamMembers.find(m => chat.members.some(mem => mem.user_id === m.user_id && mem.user_id !== currentUser?.user_id)) : null;
              const displayName = peerForChannel ? peerForChannel.nome : chat.name.replace(/^Chat:\s*/i, '');

              return (
                <button
                  key={chat.id}
                  onClick={() => { setActiveChatId(chat.id); setIsInfoDrawerOpen(false); if (typeof window !== 'undefined') window.history.replaceState(null, '', `/dashboard/conversas?chatId=${chat.id}`); }}
                  className={`w-full text-left p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center space-x-3.5 ${isActive ? 'bg-brand-panel text-white shadow-sm border-transparent scale-[1.02]' : 'hover:bg-black/5 dark:hover:bg-white/5 shadow-sm'}`}
                  style={!isActive ? { backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-input)' } : undefined}
                >
                  <div className="relative flex-shrink-0">
                    {isGeneralGroup ? <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-inner ${isActive ? 'bg-white/20 text-white' : 'bg-brand-panel/10 text-brand-panel'}`}><Megaphone className="w-6 h-6" /></div>
                    : chat.foto_url ? <img src={chat.foto_url} alt="" className="w-12 h-12 rounded-2xl object-cover shadow-sm border border-white/20" />
                    : peerForChannel?.avatar_url ? <img src={peerForChannel.avatar_url} alt="" className="w-12 h-12 rounded-2xl object-cover shadow-sm border border-white/20" />
                    : <div className={`w-12 h-12 rounded-2xl text-white font-semibold flex items-center justify-center text-sm shadow-sm ${isActive ? 'bg-white/20' : 'bg-brand-panel'}`}>{getInitials(displayName)}</div>}
                    {chat.isDirect && peerForChannel && <span className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white shadow-sm ${getRealUserStatus(peerForChannel).color}`} />}
                  </div>
                  <div className="overflow-hidden flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-[14px] font-semibold truncate">{displayName}</p>
                      {chat.lastMessageTime && <span className={`text-xs font-medium ml-2 flex-shrink-0 ${isActive ? 'text-white/80' : 'opacity-45'}`}>{chat.lastMessageTime}</span>}
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <p className={`text-[12px] truncate font-medium ${isActive ? 'text-white/85' : 'opacity-75'}`}>{chat.lastMessage || (chat.isDirect ? getRealUserStatus(peerForChannel).label : `${chat.members.length} membros`)}</p>
                      {chat.unread > 0 && !isActive && <span className="ml-2 px-2 py-0.5 rounded-full bg-red-500 text-white text-xs font-semibold shadow-sm animate-bounce">{chat.unread}</span>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* COLUNA 2: ÁREA DO CHAT */}
        {activeChat ? (
          <div className={`min-h-0 min-w-0 flex-1 flex-col h-full overflow-hidden transition-all relative w-full ${!activeChatId ? 'hidden lg:flex' : isInfoDrawerOpen ? 'hidden xl:flex' : 'flex'}`} style={{ backgroundColor: 'var(--bg-card)' }}>

            {/* CABEÇALHO DO CHAT */}
            <div role="button" tabIndex={0} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); event.currentTarget.click(); } }} onClick={() => setIsInfoDrawerOpen(!isInfoDrawerOpen)} className="p-4 md:p-6 border-b flex items-center justify-between cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors shadow-sm z-10 flex-shrink-0" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
              <div className="flex items-center space-x-3.5 overflow-hidden">
                {/* 🚀 BOTÃO VOLTAR (LIMPA O CHAT ATIVO - MOBILE ONLY) */}
                <button aria-label="Voltar" onClick={(e) => { e.stopPropagation(); setActiveChatId(null); if (typeof window !== 'undefined') window.history.replaceState(null, '', '/dashboard/conversas'); }} className="lg:hidden p-2 -ml-2 mr-1 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer text-brand-panel font-semibold text-sm transition-colors flex items-center">
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="relative flex-shrink-0">
                  {activeChat.name === 'Geral' ? <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-brand-panel/10 text-brand-panel shadow-inner border" style={{ borderColor: 'var(--border-input)' }}><Megaphone className="w-5 h-5" /></div>
                  : activeChat.foto_url ? <img src={activeChat.foto_url} alt="" className="w-11 h-11 rounded-2xl object-cover shadow-sm border border-white/20" />
                  : directPeer?.avatar_url ? <img src={directPeer.avatar_url} alt="" className="w-11 h-11 rounded-2xl object-cover shadow-sm border border-white/20" />
                  : <div className="w-11 h-11 rounded-2xl bg-brand-panel text-white font-semibold flex items-center justify-center text-sm shadow-sm">{getInitials(directPeer ? directPeer.nome : activeChat.name)}</div>}
                  {activeChat.isDirect && directPeer && <span className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm ${getRealUserStatus(directPeer).color}`} />}
                </div>
                <div className="flex flex-col min-w-0">
                  <h3 className="text-[16px] md:text-lg font-semibold leading-tight truncate">{directPeer ? directPeer.nome : activeChat.name}</h3>
                  <p className="text-xs opacity-75 font-medium truncate max-w-sm mt-0.5 uppercase tracking-wider">{activeChat.isDirect && directPeer ? `${getRealUserStatus(directPeer).label} • ${getRealUserStatus(directPeer).lastSeenText}` : <span title="Clique para ver detalhes do grupo">{formatGroupMembers(activeChat.members, currentUser.user_id)}</span>}</p>
                </div>
              </div>
              <div role="button" tabIndex={0} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); event.currentTarget.click(); } }} className="hidden sm:flex items-center space-x-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 opacity-70" />
                  <input type="text" value={messageSearch} onChange={(e) => setMessageSearch(e.target.value)} placeholder="Pesquisar..." aria-label="Pesquisar nesta conversa" className="w-full max-w-48 pl-10 pr-4 py-2.5 rounded-2xl border text-sm font-medium outline-none focus:border-brand-panel transition-colors shadow-sm" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-main)' }} />
                </div>
              </div>
            </div>

            <div onScroll={event=>{const el=event.currentTarget;stickToBottom.current=el.scrollHeight-el.scrollTop-el.clientHeight<80;}} className="flex-1 overflow-y-auto p-4 md:p-6 space-y-2 custom-scrollbar" style={{ backgroundColor: 'var(--bg-input)' }}>
              {filteredMessages.map((msg, index) => {
                const isMe = msg.sender_id === currentUser.user_id || msg.sender === currentUser.nome;
                const hasAccepted = msg.acceptedBy?.includes(currentUser.nome);
                const isRead = (msg.lidoPor || []).some(nome => nome !== currentUser.nome);
                const showDateChip = index === 0 || filteredMessages[index - 1].dateLabel !== msg.dateLabel;
                const showTail = index === 0 || filteredMessages[index - 1].sender_id !== msg.sender_id || showDateChip;

                return (
                  <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} ${showDateChip ? 'mt-6' : 'mt-2'}`}>

                    {showDateChip && <div className="flex justify-center w-full my-5"><span className="px-4 py-1.5 rounded-xl text-xs font-semibold shadow-sm opacity-90 uppercase tracking-widest border" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}>{msg.dateLabel}</span></div>}

                    <div className={`flex flex-col group relative max-w-[85%] sm:max-w-[75%]`}>

                      {msg.deleted ? (
                        <div className={`px-4 py-3 rounded-2xl text-sm shadow-sm italic opacity-70 flex items-center border font-medium`} style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-input)' }}>
                           <span className="mr-2">🚫</span> Mensagem eliminada
                        </div>
                      ) : (
                        <>
                          <div className={`absolute top-0 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity ${isMe ? '-left-14' : '-right-14'}`}>
                            {isMe && <button aria-label="Apagar" type="button" onClick={() => confirmDeleteMessage(msg.id)} className="p-1.5 text-[var(--error-text)] hover:bg-red-500/10 rounded-full transition-colors cursor-pointer" title="Apagar"><Trash2 className="w-4 h-4" /></button>}
                            <button aria-label="Responder" type="button" onClick={() => { setReplyingTo({ id: msg.id, sender: msg.sender, text: msg.text }); inputFieldRef.current?.focus(); }} className="p-1.5 opacity-75 hover:opacity-100 hover:bg-black/5 rounded-full transition-colors cursor-pointer" title="Responder"><Reply className="w-4 h-4" /></button>
                          </div>

                          <div className={`px-4 pt-3 pb-3.5 rounded-xl text-[15px] font-medium shadow-sm relative ${isMe ? 'bg-brand-panel text-white' : ''} ${showTail ? (isMe ? 'rounded-tr-sm' : 'rounded-tl-sm') : ''}`} style={!isMe ? { backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-input)' } : undefined}>
                            {!isMe && !activeChat.isDirect && showTail && <span className="text-xs font-semibold text-brand-panel block mb-1 uppercase tracking-wider">{msg.sender}</span>}
                            {msg.replyTo && <div className={`mb-2 p-3 rounded-xl border-l-4 text-sm shadow-sm ${isMe ? 'bg-black/20 border-white/60 text-white' : 'bg-black/5 border-brand-panel opacity-90'}`}><p className="font-semibold text-xs mb-0.5">{msg.replyTo.sender}</p><p className="truncate opacity-80">{msg.replyTo.text}</p></div>}

                            {msg.type === 'image' && !msg.mediaUrl && msg.metadata?.storagePath ? <a href="#" onClick={event=>{void openAttachment(event,msg);}} className="underline">Abrir imagem</a> : msg.type === 'image' && msg.mediaUrl ? (
                               <a onClick={event=>{void openAttachment(event,msg);}} href={msg.mediaUrl} target="_blank" rel="noopener noreferrer" className="space-y-1 mb-1.5 block cursor-zoom-in">
                                 <img src={msg.mediaUrl} alt="Mídia" className="max-w-full sm:max-w-xs max-h-64 object-cover rounded-xl shadow-sm border border-black/10 hover:opacity-90 transition-opacity" />
                               </a>
                            ) : msg.type === 'file' ? (
                               <div className="flex items-center space-x-3 pr-4 pb-1">
                                  <div className={`p-3 rounded-2xl shadow-sm ${isMe ? 'bg-white/20 text-white' : 'bg-brand-panel/10 text-brand-panel'}`}><FileText className="w-5 h-5" /></div>
                                  <div className="overflow-hidden flex-1 min-w-[150px]">
                                     <a onClick={event=>{void openAttachment(event,msg);}} href={msg.mediaUrl || '#'} target="_blank" rel="noopener noreferrer" className="text-[14px] font-semibold truncate hover:underline cursor-pointer block">{msg.fileName}</a>
                                     <p className="text-xs font-medium opacity-70 mt-0.5 uppercase tracking-wider">{msg.fileSize}</p>
                                  </div>
                                  <a onClick={event=>{void openAttachment(event,msg);}} href={msg.mediaUrl || '#'} target="_blank" rel="noopener noreferrer" download={msg.fileName} className="p-2 rounded-xl hover:bg-black/10 cursor-pointer transition-colors shadow-sm" title="Baixar Arquivo"><Download className="w-4 h-4" /></a>
                               </div>
                            ) : msg.type === 'event' && msg.eventDetails ? (
                               <div className="space-y-2 min-w-[220px] pb-1">
                                  <div className="flex items-center space-x-1.5 text-xs font-semibold opacity-90 uppercase tracking-widest"><Calendar className="w-3.5 h-3.5" /><span>Reunião Agendada</span></div>
                                  <h4 className="text-[15px] font-semibold leading-tight break-words">{msg.eventDetails.title}</h4>
                                  <p className="text-sm font-medium opacity-85">📅 {msg.eventDetails.date} às {msg.eventDetails.time}</p>
                                  <div className="pt-2.5 mt-2 border-t border-white/20 flex items-center justify-between text-xs">
                                     <span className="opacity-80 font-medium">{msg.acceptedBy?.length || 0} confirmados</span>
                                     <button onClick={() => handleAcceptChatEvent(msg)} disabled={hasAccepted} className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer shadow-sm ${hasAccepted ? 'bg-emerald-500 text-white' : 'bg-white text-slate-900 hover:opacity-90'}`}><Check className="w-3.5 h-3.5 inline mr-1" />{hasAccepted ? 'Presença Confirmada' : 'Confirmar'}</button>
                                  </div>
                               </div>
                            ) : (
                               <div className="whitespace-pre-wrap break-words">{formatLinks(msg.text)}</div>
                            )}

                            <div className={`float-right flex items-center space-x-1 ml-4 mt-2 text-xs font-semibold uppercase tracking-widest ${isMe ? 'text-white/70' : 'opacity-70'}`}><span className="pt-[1px]">{msg.time}</span>{msg.status==='error'&&<button type="button" aria-label="Reenviar mensagem" onClick={async()=>{if(await sendToDatabase(msg.type,msg.text,msg.metadata||{},msg.id,msg.canal_id)){setDrafts(prev=>prev[msg.canal_id]===msg.text?{...prev,[msg.canal_id]:''}:prev);}}}>Reenviar</button>}{isMe && (msg.status === 'sending' ? <Clock className="w-3 h-3 animate-spin" /> : msg.status === 'error' ? <AlertTriangle className="w-3 h-3 text-red-300" /> : <CheckCheck className={`w-3.5 h-3.5 ${isRead ? 'text-sky-300' : 'opacity-70'}`} />)}</div>
                            <div className="clear-both"></div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
              {activeMessages.length === 0 && (
                 <div className="h-full min-h-[250px] flex flex-col items-center justify-center text-center opacity-70 space-y-4">
                    <MessageSquare className="w-12 h-12 stroke-1" />
                    <p className="text-sm font-medium">O histórico de conversa inicia aqui.</p>
                 </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* CAIXAS FLUTUANTES (RESPONDER E EMOJIS) */}
            <div className="relative">

              {/* 🚀 PAINEL DE EMOJIS FLUTUANTE */}
              {showEmojiPicker && (
                 <div className="absolute bottom-full left-4 md:left-6 mb-2 p-3 max-w-[calc(100vw-2rem)] rounded-2xl shadow-sm flex flex-wrap gap-2 animate-in slide-in-from-bottom-2 border" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
                    {QUICK_EMOJIS.map(emoji => (
                       <button key={emoji} type="button" onClick={() => handleEmojiSelect(emoji)} className="w-8 h-8 flex items-center justify-center text-xl hover:bg-black/10 dark:hover:bg-white/10 rounded-full transition-colors cursor-pointer">{emoji}</button>
                    ))}
                 </div>
              )}

              {replyingTo && (
                <div className="mx-4 md:mx-6 mb-2 p-3 rounded-2xl flex items-center justify-between shadow-sm border-l-4 border-brand-panel animate-in slide-in-from-bottom-2" style={{ backgroundColor: 'var(--bg-card)' }}>
                   <div className="truncate flex-1 min-w-0 pr-4">
                      <span className="font-semibold text-brand-panel text-xs block uppercase tracking-wider">{replyingTo.sender}</span>
                      <span className="opacity-80 text-sm truncate block font-medium mt-0.5">{replyingTo.text}</span>
                   </div>
                   <button aria-label="Fechar" onClick={() => setReplyingTo(null)} className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer flex-shrink-0"><X className="w-4 h-4 opacity-75" /></button>
                </div>
              )}
            </div>

            {activeChat.name === 'Geral' && !isCurrentAdmin ? (
              <div className="p-4 border-t flex items-center justify-center bg-black/5 dark:bg-white/5 flex-shrink-0 pb-safe" style={{ borderColor: 'var(--border-input)' }}>
                 <span className="text-[12px] font-medium opacity-70 text-center uppercase tracking-widest">Apenas Administradores podem enviar avisos neste grupo.</span>
              </div>
            ) : (
              <div className="chat-composer p-4 md:p-6 border-t flex flex-col flex-shrink-0 pb-safe" style={{ borderColor: 'var(--border-input)', backgroundColor: 'var(--bg-card)' }}>
                <form onSubmit={handleSendMessage} className="chat-compose-form flex flex-wrap items-end gap-2 sm:flex-nowrap">
                  <div className="flex items-center bg-black/5 dark:bg-white/5 rounded-full p-1 shadow-sm mb-0.5">
                     <button aria-label="Emojis" type="button" onClick={(e) => { e.preventDefault(); setShowEmojiPicker(!showEmojiPicker); }} className="p-2.5 rounded-full hover:bg-white dark:hover:bg-black/50 opacity-70 hover:opacity-100 transition-colors cursor-pointer" title="Emojis"><Smile className="w-5 h-5" /></button>
                     <button aria-label="Anexar Imagem" type="button" onClick={() => imageInputRef.current?.click()} className="p-2.5 rounded-full hover:bg-white dark:hover:bg-black/50 opacity-70 hover:opacity-100 transition-colors cursor-pointer" title="Anexar Imagem"><ImageIcon className="w-5 h-5" /></button>
                     <button aria-label="Anexar Ficheiro" type="button" onClick={() => fileInputRef.current?.click()} className="p-2.5 rounded-full hover:bg-white dark:hover:bg-black/50 opacity-70 hover:opacity-100 transition-colors cursor-pointer" title="Anexar Ficheiro"><Paperclip className="w-5 h-5" /></button>
                  </div>

                  <textarea
                     ref={inputFieldRef}
                     value={inputText}
                     onChange={handleInputResize}
                     onKeyDown={handleKeyDown}
                     rows={1}
                     placeholder="Escreva a sua mensagem..."
                     aria-label="Mensagem" className="chat-compose-input order-first w-full basis-full sm:order-none sm:w-auto sm:basis-auto min-w-0 flex-1 px-5 py-3.5 rounded-3xl border text-[14px] font-medium outline-none focus:border-brand-panel transition-colors shadow-sm resize-none overflow-y-auto custom-scrollbar leading-tight"
                     style={{ minHeight: '52px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-main)' }}
                  />

                  {inputText.trim() ? (
                     <button aria-label="Enviar" type="submit" className="p-4 rounded-full bg-brand-panel text-white cursor-pointer hover:opacity-90 transition-transform active:scale-95 shadow-sm flex items-center justify-center flex-shrink-0 mb-0.5">
                        <Send className="w-5 h-5 ml-0.5" />
                     </button>
                  ) : (
                     <button aria-label="Agendar reunião" type="button" onClick={() => setIsEventModalOpen(true)} className="p-4 rounded-full bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 opacity-70 hover:opacity-100 transition-transform active:scale-95 cursor-pointer shadow-sm flex items-center justify-center flex-shrink-0 mb-0.5">
                        <Calendar className="w-5 h-5" />
                     </button>
                  )}
                </form>
              </div>
            )}
          </div>
        ) : (
          <div className="hidden lg:flex lg:flex-1 flex-col items-center justify-center h-full opacity-70 space-y-4" style={{ backgroundColor: 'var(--bg-card)' }}>
             <MessageSquare className="w-16 h-16 stroke-1" />
             <p className="text-[15px] font-medium">Selecione ou inicie uma conversa para começar.</p>
          </div>
        )}

        {/* COLUNA 3: GAVETA DE INFORMAÇÕES */}
        {isInfoDrawerOpen && activeChat && (
          <div className={`${isInfoDrawerOpen ? 'flex' : 'hidden'} xl:flex flex-col w-full xl:w-[320px] flex-shrink-0 h-full overflow-hidden animate-in slide-in-from-right duration-300 border-l`} style={{ backgroundColor: 'var(--bg-input)', borderLeft: '1px solid var(--border-input)' }}>

            <div className="p-6 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-input)' }}>
               <div className="flex items-center space-x-2">
                 <button aria-label="Voltar" onClick={() => setIsInfoDrawerOpen(false)} className="lg:hidden p-2 -ml-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors"><ArrowLeft className="w-5 h-5" /></button>
                 <h4 className="font-semibold text-sm">{activeChat.isDirect ? 'Informação do Contato' : 'Detalhes do Grupo'}</h4>
               </div>
               <button aria-label="Fechar" onClick={() => setIsInfoDrawerOpen(false)} className="hidden xl:flex p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-6 text-center border-b space-y-4" style={{ borderColor: 'var(--border-input)' }}>
              <div className="relative w-24 h-24 mx-auto rounded-3xl overflow-hidden shadow-sm bg-brand-panel text-white font-semibold flex items-center justify-center text-3xl">
                 {activeChat.name === 'Geral' ? <Megaphone className="w-12 h-12" /> : activeChat.foto_url ? <img src={activeChat.foto_url} alt="" className="w-full h-full object-cover" /> : directPeer?.avatar_url ? <img src={directPeer.avatar_url} alt="" className="w-full h-full object-cover" /> : getInitials(directPeer ? directPeer.nome : activeChat.name)}
              </div>
              <div>
                 <h3 className="font-semibold text-[18px]">{directPeer ? directPeer.nome : activeChat.name}</h3>
                 <p className="text-xs font-medium uppercase tracking-widest opacity-75 mt-1">{activeChat.isDirect ? `${directPeer?.cargo?.toUpperCase() || 'COLABORADOR'}` : `Grupo • ${activeChat.members.length} participantes`}</p>
              </div>

              {!activeChat.isDirect && isCurrentAdmin && activeChat.name !== 'Geral' && (
                 <form onSubmit={event=>{event.preventDefault();void recordActions.run('group-photo',()=>handleSaveGroupPhoto(event));}} className="flex space-x-2 pt-2">
                    <input type="url" value={groupPhotoUrl} onChange={(e) => setGroupPhotoUrl(e.target.value)} placeholder="URL da foto..." className="flex-1 px-4 py-2.5 rounded-xl border text-xs font-medium outline-none focus:border-brand-panel shadow-sm" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-main)' }} />
                    <button type="submit" className="px-4 py-2.5 rounded-xl bg-brand-panel text-white text-xs font-semibold cursor-pointer shadow-sm hover:opacity-90 transition-transform active:scale-95">Salvar</button>
                 </form>
              )}
            </div>

            <div className="flex border-b text-[12px] font-semibold text-center uppercase tracking-widest overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none'] flex-shrink-0" style={{ borderColor: 'var(--border-input)' }}>
               {!activeChat.isDirect && <button onClick={() => setInfoTab('members')} className={`px-4 py-4 border-b-2 transition-colors flex-shrink-0 cursor-pointer ${infoTab === 'members' ? 'border-brand-panel text-brand-panel bg-brand-panel/5' : 'border-transparent opacity-75 hover:opacity-100'}`}>Membros</button>}
               <button onClick={() => setInfoTab('notes')} className={`px-4 py-4 border-b-2 transition-colors flex-shrink-0 cursor-pointer ${infoTab === 'notes' ? 'border-brand-panel text-brand-panel bg-brand-panel/5' : 'border-transparent opacity-75 hover:opacity-100'}`}>Avisos</button>
               <button onClick={() => setInfoTab('media')} className={`px-4 py-4 border-b-2 transition-colors flex-shrink-0 cursor-pointer ${infoTab === 'media' ? 'border-brand-panel text-brand-panel bg-brand-panel/5' : 'border-transparent opacity-75 hover:opacity-100'}`}>Mídia</button>
               <button onClick={() => setInfoTab('files')} className={`px-4 py-4 border-b-2 transition-colors flex-shrink-0 cursor-pointer ${infoTab === 'files' ? 'border-brand-panel text-brand-panel bg-brand-panel/5' : 'border-transparent opacity-75 hover:opacity-100'}`}>Docs</button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
              {infoTab === 'members' && !activeChat.isDirect && (
                 <div className="space-y-4">
                    {isCurrentAdmin && activeChat.name !== 'Geral' && (
                       <button onClick={() => setIsAddMemberModalOpen(true)} className="w-full py-3 rounded-2xl bg-brand-panel text-white font-semibold text-[12px] flex items-center justify-center space-x-2 shadow-sm cursor-pointer hover:opacity-90 active:scale-95 transition-transform"><UserPlus className="w-4 h-4" /><span>Convidar</span></button>
                    )}
                    <div className="space-y-1.5">
                       {activeChat.members.map((member, idx) => {
                          const memberProfile = teamMembers.find(m => m.user_id === member.user_id);
                          return (
                             <div key={idx} className="p-3.5 rounded-2xl flex items-center justify-between text-[12px] shadow-sm transition-colors border" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-input)' }}>
                                <div className="flex items-center space-x-3 overflow-hidden">
                                   <div className="w-9 h-9 rounded-xl bg-brand-panel text-white font-semibold flex items-center justify-center text-xs flex-shrink-0 shadow-sm border border-white/20">
                                      {memberProfile?.avatar_url ? <img src={memberProfile.avatar_url} alt="" className="w-full h-full rounded-xl object-cover" /> : getInitials(member.name)}
                                   </div>
                                   <div className="truncate min-w-0">
                                      <p className="font-semibold truncate text-sm">{member.name} {member.user_id === currentUser.user_id && '(Você)'}</p>
                                      <p className="text-xs font-medium uppercase tracking-wider opacity-75 truncate mt-0.5">{member.role} {member.isAdmin ? '• Admin' : ''}</p>
                                   </div>
                                </div>
                                <div className="flex items-center space-x-2 flex-shrink-0">
                                   {isCurrentAdmin && member.user_id !== currentUser.user_id && <button onClick={() => toggleAdminMember(member.user_id)} className="text-xs font-medium text-brand-panel hover:underline cursor-pointer">{member.isAdmin ? 'Revogar Admin' : 'Dar Admin'}</button>}
                                   {isCurrentAdmin && member.user_id !== currentUser.user_id && activeChat.name !== 'Geral' && <button aria-label="Remover" onClick={() => handleRemoveMemberFromGroup(member.user_id, member.name)} className="p-2 rounded-lg text-[var(--error-text)] hover:bg-red-500/10 transition-colors cursor-pointer ml-1" title="Remover"><Trash2 className="w-4 h-4" /></button>}
                                </div>
                             </div>
                          );
                       })}
                    </div>
                 </div>
              )}
              {infoTab === 'notes' && (
                 <div className="space-y-4">
                    <form onSubmit={handleAddNote} className="space-y-3">
                       <textarea rows={3} value={newNoteText} onChange={(e) => setNewNoteText(e.target.value)} placeholder="Fixar aviso permanente neste chat..." className="w-full p-4 rounded-2xl border text-sm font-medium outline-none resize-none shadow-sm focus:border-brand-panel transition-colors" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-main)' }} />
                       <button type="submit" className="w-full py-3 rounded-2xl bg-brand-panel text-white font-semibold text-[12px] shadow-sm cursor-pointer hover:opacity-90 active:scale-95 transition-transform">+ Afixar Aviso</button>
                    </form>
                    <div className="space-y-3 pt-2">
                       {chatNotes.map(note => (
                          <div key={note.id} className="p-4 rounded-2xl border text-sm space-y-2 shadow-sm font-medium" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-input)' }}>
                             <div className="flex justify-between font-semibold opacity-75 text-xs uppercase tracking-widest border-b pb-2 mb-2" style={{ borderColor: 'var(--border-input)' }}>
                                <span>{note.autor_nome}</span>
                                <span>{new Date(note.created_at).toLocaleDateString('pt-BR')}</span>
                             </div>
                             <p className="whitespace-pre-wrap leading-relaxed">{note.conteudo}</p>
                          </div>
                       ))}
                       {chatNotes.length === 0 && <p className="text-center opacity-70 font-medium text-xs py-4">Sem notas afixadas.</p>}
                    </div>
                 </div>
              )}
              {infoTab === 'media' && (
                 <div className="grid grid-cols-2 gap-3">
                    {activeMessages.filter(m => m.type === 'image' && m.mediaUrl && !m.deleted).map(m => (
                       <a key={m.id} href={m.mediaUrl} target="_blank" rel="noopener noreferrer" className="rounded-xl overflow-hidden border aspect-square shadow-sm hover:scale-105 transition-transform cursor-pointer block" style={{ borderColor: 'var(--border-input)' }}>
                          <img src={m.mediaUrl} alt="Mídia" className="w-full h-full object-cover" />
                       </a>
                    ))}
                    {activeMessages.filter(m => m.type === 'image' && m.mediaUrl && !m.deleted).length === 0 && <p className="col-span-2 text-center opacity-70 font-medium text-xs py-4">Sem ficheiros de média partilhados.</p>}
                 </div>
              )}

              {infoTab === 'files' && (
                 <div className="space-y-3">
                    {activeMessages.filter(m => m.type === 'file' && m.mediaUrl && !m.deleted).map(m => (
                       <div key={m.id} className="flex items-center space-x-3 p-3 rounded-2xl border shadow-sm" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-input)' }}>
                          <div className="p-2.5 rounded-xl bg-brand-panel/10 text-brand-panel flex-shrink-0"><FileText className="w-5 h-5" /></div>
                          <div className="overflow-hidden flex-1 min-w-0">
                             <a onClick={event=>{void openAttachment(event,m);}} href={m.mediaUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold truncate hover:underline block cursor-pointer">{m.fileName}</a>
                             <p className="text-xs font-medium opacity-70 uppercase tracking-wider mt-0.5">{m.fileSize} • {m.dateLabel}</p>
                          </div>
                          <a onClick={event=>{void openAttachment(event,m);}} href={m.mediaUrl} download={m.fileName} className="p-2 rounded-xl hover:bg-black/10 transition-colors cursor-pointer flex-shrink-0" title="Baixar Arquivo"><Download className="w-4 h-4" /></a>
                       </div>
                    ))}
                    {activeMessages.filter(m => m.type === 'file' && m.mediaUrl && !m.deleted).length === 0 && <p className="text-center opacity-70 font-medium text-xs py-4">Sem documentos partilhados.</p>}
                 </div>
              )}
            </div>

            <div className="p-4 border-t" style={{ borderColor: 'var(--border-input)' }}>
               <button onClick={() => handleCloseChat(activeChat.id)} className="w-full py-3.5 rounded-2xl bg-red-500/10 text-[var(--error-text)] hover:bg-red-500/20 font-semibold text-sm flex items-center justify-center space-x-2 transition-colors cursor-pointer shadow-sm">
                  <Trash2 className="w-4 h-4" /><span>Excluir Conversa</span>
               </button>
            </div>
          </div>
        )}

      </div>

      {/* MODAIS Z-[999] */}
      {isGroupModalOpen && (
         <ModalShell open description={<><span className="text-xs font-semibold uppercase tracking-widest text-brand-panel">Comunicação</span></>} title={<>Criar Novo Grupo</>} onClose={() => setIsGroupModalOpen(false)} busy={dialogAction.pending} footer={<div className="flex justify-end space-x-3 pt-4 border-t" style={{ borderColor: 'var(--border-input)' }}>
                     <button form="modal-form-1" type="button" onClick={() => setIsGroupModalOpen(false)} className="px-6 py-3.5 rounded-xl border text-sm font-semibold cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors" style={{ borderColor: 'var(--border-input)' }}>Cancelar</button>
                     <button form="modal-form-1" type="submit" className="px-7 py-3.5 rounded-xl bg-brand-panel text-white text-sm font-semibold shadow-sm cursor-pointer hover:opacity-90 active:scale-95 transition-transform">Criar Grupo</button>
                  </div>}>
<form id="modal-form-1" onSubmit={event => { event.preventDefault(); void dialogAction.run(() => handleCreateGroup(event)); }} className="p-6 md:p-8 space-y-6">
                  <div>
                     <label htmlFor="field-1" className="text-xs font-semibold uppercase tracking-widest opacity-75 block mb-2">Nome do Grupo</label>
                     <input id="field-1" type="text" required value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="Ex: Equipe de TI" className="w-full px-4 py-3.5 rounded-2xl border text-sm font-medium outline-none focus:border-brand-panel transition-colors shadow-sm" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-main)' }} />
                  </div>
                  <div>
                     <label htmlFor="field-2" className="text-xs font-semibold uppercase tracking-widest opacity-75 block mb-2">Selecione os Participantes</label>
                     <div className="max-h-52 overflow-y-auto space-y-2 p-3 rounded-2xl border shadow-sm" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-input)' }}>
                        {teamMembers.filter(m => m.user_id !== currentUser?.user_id).map(member => (
                           <label key={member.user_id} className="flex items-center justify-between p-3 rounded-xl cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors border border-transparent hover:border-[var(--border-input)]">
                              <span className="font-medium text-sm">{member.nome}</span>
                              <input id="field-2" type="checkbox" checked={selectedMembersToAdd.includes(member.user_id)} onChange={(e) => { if (e.target.checked) setSelectedMembersToAdd(prev => [...prev, member.user_id]); else setSelectedMembersToAdd(prev => prev.filter(id => id !== member.user_id)); }} className="w-5 h-5 rounded border-gray-300 accent-blue-600 cursor-pointer shadow-sm" />
                           </label>
                        ))}
                     </div>
                  </div>

               </form>
</ModalShell>
      )}

      {isAddMemberModalOpen && (
         <ModalShell open description={<><span className="text-xs font-semibold uppercase tracking-widest text-brand-panel">Gestão</span></>} title={<>Convidar Colega</>} onClose={() => setIsAddMemberModalOpen(false)} busy={dialogAction.pending} footer={<div className="flex justify-end space-x-3 pt-4 border-t" style={{ borderColor: 'var(--border-input)' }}>
                     <button form="modal-form-2" type="button" onClick={() => setIsAddMemberModalOpen(false)} className="px-6 py-3.5 rounded-xl border text-sm font-semibold cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors" style={{ borderColor: 'var(--border-input)' }}>Cancelar</button>
                     <button form="modal-form-2" type="submit" className="px-7 py-3.5 rounded-xl bg-brand-panel text-white text-sm font-semibold shadow-sm cursor-pointer hover:opacity-90 active:scale-95 transition-transform">Adicionar</button>
                  </div>}>
<form id="modal-form-2" onSubmit={event => { event.preventDefault(); void dialogAction.run(() => handleAddMemberToGroup(event)); }} className="p-6 md:p-8 space-y-6">
                  <div>
                     <label htmlFor="field-3" className="text-xs font-semibold uppercase tracking-widest opacity-75 block mb-2">Escolher Colaborador</label>
                     <select id="field-3" value={memberToAddId} onChange={(e) => setMemberToAddId(e.target.value)} className="w-full p-4 rounded-2xl border text-sm font-medium outline-none cursor-pointer focus:border-brand-panel transition-colors shadow-sm" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-main)' }}>
                        <option value="">Selecione da lista...</option>
                        {teamMembers.filter(m => !activeChat?.members.some(am => am.user_id === m.user_id)).map(m => (
                           <option key={m.user_id} value={m.user_id}>{m.nome} ({m.setor})</option>
                        ))}
                     </select>
                  </div>

               </form>
</ModalShell>
      )}

      {isEventModalOpen && (
         <ModalShell open description={<><span className="text-xs font-semibold uppercase tracking-widest text-brand-panel">Agendamento</span></>} title={<>Reunião no Chat</>} onClose={() => setIsEventModalOpen(false)} busy={dialogAction.pending} footer={<div className="flex justify-end space-x-3 pt-4 border-t" style={{ borderColor: 'var(--border-input)' }}>
                     <button form="modal-form-3" type="button" onClick={() => setIsEventModalOpen(false)} className="px-6 py-3.5 rounded-xl border text-sm font-semibold cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors" style={{ borderColor: 'var(--border-input)' }}>Cancelar</button>
                     <button form="modal-form-3" type="submit" className="px-7 py-3.5 rounded-xl bg-brand-panel text-white text-sm font-semibold shadow-sm cursor-pointer hover:opacity-90 active:scale-95 transition-transform">Enviar Convite</button>
                  </div>}>
<form id="modal-form-3" onSubmit={event => { event.preventDefault(); void dialogAction.run(() => handleCreateChatEvent(event)); }} className="p-6 md:p-8 space-y-6">
                  <div>
                     <label htmlFor="field-4" className="text-xs font-semibold uppercase tracking-widest opacity-75 block mb-2">Título do Convite</label>
                     <input id="field-4" type="text" required value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} placeholder="Ex: Alinhamento Semanal..." className="w-full px-4 py-3.5 rounded-2xl border text-sm font-medium outline-none focus:border-brand-panel transition-colors shadow-sm" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-main)' }} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                     <div>
                        <label htmlFor="field-5" className="text-xs font-semibold uppercase tracking-widest opacity-75 block mb-2">Data</label>
                        <input id="field-5" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="w-full px-4 py-3.5 rounded-2xl border text-sm font-medium outline-none focus:border-brand-panel transition-colors shadow-sm cursor-pointer" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-main)' }} />
                     </div>
                     <div>
                        <label htmlFor="field-6" className="text-xs font-semibold uppercase tracking-widest opacity-75 block mb-2">Horário</label>
                        <input id="field-6" type="time" value={eventTime} onChange={(e) => setEventTime(e.target.value)} className="w-full px-4 py-3.5 rounded-2xl border text-sm font-medium outline-none focus:border-brand-panel transition-colors shadow-sm cursor-pointer" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-main)' }} />
                     </div>
                  </div>
                  <div>
                     <label htmlFor="field-7" className="text-xs font-semibold uppercase tracking-widest opacity-75 block mb-2">Local ou Link (Opcional)</label>
                     <input id="field-7" type="text" value={eventLocation} onChange={(e) => setEventLocation(e.target.value)} placeholder="Ex: Sala 2 ou Google Meet" className="w-full px-4 py-3.5 rounded-2xl border text-sm font-medium outline-none focus:border-brand-panel transition-colors shadow-sm" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-main)' }} />
                  </div>

               </form>
</ModalShell>
      )}

      {/* MODAL DE CONFIRMAÇÃO GENÉRICO */}
      {confirmModal.isOpen && (
        <ModalShell open title={<>{confirmModal.title}</>} onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))} destructive busy={dialogAction.pending}  footer={<div className="flex flex-col sm:flex-row justify-end space-y-3 sm:space-y-0 sm:space-x-3 px-6 md:px-8 py-5 border-t" style={{ borderColor: 'var(--border-input)' }}>
              <button onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))} className="w-full sm:w-auto px-6 py-3.5 rounded-xl border text-sm font-semibold cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors" style={{ borderColor: 'var(--border-input)' }}>Cancelar</button>
              <button onClick={() => dialogAction.run(confirmModal.onConfirm)} className={`w-full sm:w-auto px-7 py-3.5 rounded-xl text-white text-sm font-semibold cursor-pointer transition-colors shadow-sm active:scale-95 ${confirmModal.isDestructive ? 'bg-red-500 hover:bg-red-600' : 'bg-brand-panel hover:opacity-90'}`}>
                Confirmar
              </button>
            </div>}>
<div className="p-6 md:p-8"><p className="text-sm font-semibold opacity-80 leading-relaxed text-center">{confirmModal.message}</p></div>
</ModalShell>
      )}

    </div>
  );
}
