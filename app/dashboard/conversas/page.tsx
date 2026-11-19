'use client';
import './chat-workspace.css';
import { primaryActionStyle } from '@/app/components/BrandMark';
import ChatGameModal from './ChatGameModal';
import { useChatTyping } from './useChatTyping';
import { PortalPresenceContext } from '../usePortalPresence';
import {
  acceptGameChallenge,
  CHAT_GAMES,
  createGameChallenge,
  declineGameChallenge,
  gameLabel,
  playerSide,
  type ChatGameState,
  type GameKind,
} from '@/app/lib/chatGames';
import { getRealUserStatus, isDoNotDisturb, STATUS_OPTIONS, type UserStatusType } from '../../lib/chatPresence';
import { playBuzzSentSound, playPortalSound } from '../../lib/notificationSound';
import { formatPortalDate, formatPortalTime, portalDayKey, serverNowDate, serverNowIso, serverNowMs } from '@/app/lib/serverClock';
import { useSignOut } from '@/app/lib/useSignOut';

import ModalShell from '../ModalShell';
import { useDialogAction } from '../useDialogAction';

import { messageOf, occurrenceId, requireResult, searchKey } from '@/app/lib/domain';
import { confirmOutgoing, pendingOutgoing, retainOutgoing } from '@/app/lib/chatOutbox';
import type { ChannelRow, Member, MessageMetadata, MessageRow } from '@/app/lib/models';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  BellRing,
  Calendar,
  Check,
  CheckCheck,
  Clock,
  Copy,
  Download,
  FileText,
  Gamepad2,
  Image as ImageIcon,
  Loader2,
  LogOut,
  Megaphone,
  MessageSquare,
  Paperclip,
  Pencil,
  Reply,
  Search,
  Send,
  Smile,
  Trash2,
  Trophy,
  UserPlus,
  Users,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import { useCallback,useContext,useEffect,useMemo,useRef,useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRecordActions } from '../useRecordActions';

type RoleType = 'administrador' | 'gestor' | 'coordenador' | 'supervisor' | 'analista' | 'colaborador';

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
  const msgDay = portalDayKey(dateStr);
  const now = serverNowDate();
  const todayDay = portalDayKey(now);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayDay = portalDayKey(yesterday);
  if (msgDay && msgDay === todayDay) return 'Hoje';
  if (msgDay && msgDay === yesterdayDay) return 'Ontem';
  return formatPortalDate(dateStr);
};

const formatGroupMembers = (members: Member[], currentUserId: string) => {
  const others = members.filter(m => m.user_id !== currentUserId);
  if (others.length === 0) return 'Só você';
  if (others.length === 1) return others[0].name.split(' ')[0];
  if (others.length === 2) return `${others[0].name.split(' ')[0]} e ${others[1].name.split(' ')[0]}`;
  return `${others[0].name.split(' ')[0]}, ${others[1].name.split(' ')[0]} e mais ${others.length - 2}`;
};

const mapDbToMessage = (dbMsg: MessageRow): Message => ({
  id: dbMsg.id, canal_id: dbMsg.canal_id, sender_id: dbMsg.sender_id, sender: dbMsg.sender_nome, text: dbMsg.texto, time: formatPortalTime(dbMsg.created_at),
  dateLabel: getDateLabel(dbMsg.created_at), type: dbMsg.tipo || 'text', status: 'sent', mediaUrl: dbMsg.metadata?.mediaUrl, fileName: dbMsg.metadata?.fileName, fileSize: dbMsg.metadata?.fileSize,
  eventDetails: dbMsg.metadata?.eventDetails, acceptedBy: dbMsg.metadata?.acceptedBy || [], lidoPor: dbMsg.metadata?.lidoPor || [], replyTo: dbMsg.metadata?.replyTo, created_at: dbMsg.created_at, deleted: dbMsg.metadata?.deleted || false, metadata: dbMsg.metadata
});



const formatLinks = (text: string) => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.split(urlRegex).map((part, i) =>
    urlRegex.test(part) ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline hover:opacity-80 transition-opacity break-words">{part}</a> : part
  );
};

// 🚀 MATRIZ DE EMOJIS RÁPIDOS E REAÇÕES ESTILO WHATSAPP / TELEGRAM
const QUICK_EMOJIS = ['👍', '✅', '🚀', '❤️', '😂', '🙏', '🔥', '👀', '⚠️', '🎉'];
const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '🙏', '✅'];
const BUZZ_COOLDOWN_MS = 30_000;

export default function ConversasPage() {
  const dialogAction = useDialogAction();
  const recordActions = useRecordActions();
  const seenMessageIds = useRef(new Set<string>());
  const stickToBottom = useRef(true);
  const directRequests = useRef(new Map<string, Promise<ChannelRow>>());


  const [currentUser, setCurrentUser] = useState<DBProfile | null>(null);
  const [chatConnection,setChatConnection]=useState('Conectando…');
  const [focusedMessageId,setFocusedMessageId]=useState<string|null>(()=>typeof window==='undefined'?null:new URLSearchParams(window.location.search).get('messageId'));
  const focusedScroll=useRef<string|null>(null);
  const presence=useContext(PortalPresenceContext);
  const userStatus=presence.status;
  const [presenceTime, tickPresence] = useState(() => serverNowMs());
  useEffect(() => {
    const syncTick = () => tickPresence(serverNowMs());
    const timer = setInterval(syncTick, 10000);
    window.addEventListener('doodoo:clock_synced', syncTick);
    return () => {
      clearInterval(timer);
      window.removeEventListener('doodoo:clock_synced', syncTick);
    };
  }, []);
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
  const channelsRef = useRef<ChatChannel[]>([]);

  useEffect(() => { activeChatIdRef.current = activeChatId; }, [activeChatId]);
  useEffect(() => { channelsRef.current = channels; }, [channels]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const cId = params.get('chatId');
      if (cId) pendingChatIdRef.current = cId;

    }
  }, []);

  const [drafts, setDrafts] = useState<Record<string,string>>({});
  const inputText = drafts[activeChatId || ''] || '';
  const typing = useChatTyping(currentUser?.user_id, channels, activeChatId);
  const { clearSender: clearTypingSender } = typing;
  const activeTypers = activeChatId ? typing.typers(activeChatId) : [];
  const activeTypersCount = activeTypers.length;
  const setInputText = (value: React.SetStateAction<string>) => { const id=activeChatIdRef.current;if(id)setDrafts(prev=>({...prev,[id]:typeof value==='function'?value(prev[id]||''):value})); };

  const [replyingTo, setReplyingTo] = useState<ReplyInfo | null>(null);
  const [editingMessage, setEditingMessage] = useState<{ id: string; text: string } | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{ url: string; fileName?: string } | null>(null);
  const [buzzCooldownUntil, setBuzzCooldownUntil] = useState<Record<string, number>>({});
  const buzzCooldownRef = useRef<Record<string, number>>({});
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGamePicker, setShowGamePicker] = useState(false);
  const [activeGameMessageId, setActiveGameMessageId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [messageSearch, setMessageSearch] = useState('');
  const [chatFilter,setChatFilter]=useState<'all'|'unread'|'groups'>('all');
  const [urgentChannelId,setUrgentChannelId]=useState<string|null>(null);
  const urgentLocks=useRef(new Set<string>());
  const [awayFromBottom,setAwayFromBottom]=useState(false);


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
    if(next!==activeChatIdRef.current){setUrgentChannelId(null);setMessageSearch('');setAwayFromBottom(false);setReplyingTo(null);setEditingMessage(null);setShowEmojiPicker(false);setShowGamePicker(false);setActiveGameMessageId(null);setActiveMessages([]);setChatNotes([]);stickToBottom.current=true;}
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
  useEffect(()=>{if(activeTypersCount>0&&stickToBottom.current)scrollToBottom('smooth');},[activeTypersCount,scrollToBottom]);

  useEffect(()=>{
    if(!currentUser)return;
    let mounted=true,loading=false;
    const refresh=async()=>{
      if(loading||document.visibilityState!=='visible')return;loading=true;
      try{
        const [{data:profiles,error:profilesError},{data:rows,error:channelsError}]=await Promise.all([supabase.from('doodoo_perfis').select('*').eq('status','ativo'),supabase.from('doodoo_canais').select('*')]);
        if(!mounted)return;
        if(!profilesError&&profiles)setTeamMembers(profiles);
        if(!channelsError&&rows){
          const permitted=rows.filter(c=>c.membros?.some((m:Member)=>m.user_id===currentUser.user_id));
          const id=activeChatIdRef.current;
          if(id&&!id.startsWith('temp_')&&!permitted.some(c=>c.id===id)){setActiveChatId(null);setIsInfoDrawerOpen(false);}
          setChannels(prev=>{
            const candidates:ChatChannel[]=[...prev.filter(c=>c.id.startsWith('temp_')),...permitted.map(c=>{
              const previous=prev.find(p=>p.id===c.id),peer=c.membros.find((m:Member)=>m.user_id!==currentUser.user_id);
              return {...previous,id:c.id,name:c.is_direct?(profiles?.find(p=>p.user_id===peer?.user_id)?.nome||peer?.name||'Conversa'):c.nome,isGroup:c.is_group,isDirect:c.is_direct,members:c.membros,foto_url:c.foto_url,sector:c.setor,unread:previous?.unread||0,updatedAt:previous?.updatedAt||c.created_at};
            })];
            // Keep the chosen direct room stable if legacy duplicates exist for a pair.
            candidates.sort((a,b)=>Number(b.id===id)-Number(a.id===id)||Number(prev.some(p=>p.id===b.id))-Number(prev.some(p=>p.id===a.id)));
            const peers=new Set<string>();
            return candidates.filter(c=>{if(!c.isDirect)return true;const peer=c.members.find(m=>m.user_id!==currentUser.user_id)?.user_id;if(!peer||peers.has(peer))return false;peers.add(peer);return true;}).sort((a,b)=>a.name==='Geral'?-1:b.name==='Geral'?1:new Date(b.updatedAt||0).getTime()-new Date(a.updatedAt||0).getTime());
          });
        }
      }catch{ /* Keep the last directory snapshot until the next successful refresh. */ }finally{loading=false;}
    };
    const timer=setInterval(()=>void refresh(),30000),visible=()=>{void refresh();};
    window.addEventListener('online',visible);window.addEventListener('focus',visible);document.addEventListener('visibilitychange',visible);
    return()=>{mounted=false;clearInterval(timer);window.removeEventListener('online',visible);window.removeEventListener('focus',visible);document.removeEventListener('visibilitychange',visible);};
  },[currentUser]);

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
        }

        if (!session?.user || !perfilAtual) { setAuthError(true); return; }

        if (perfilAtual) {
          setCurrentUser(perfilAtual);

          const seteDias = serverNowDate(); seteDias.setDate(seteDias.getDate() - 7);

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

          const mappedChannels: ChatChannel[] = rawChannels.map(c => {
            const listaMembros = Array.isArray(c.membros) ? c.membros : [];
            const peer = c.is_direct ? membersList.find((m: DBProfile) => listaMembros.some((mem: Member) => mem.user_id === m.user_id && mem.user_id !== perfilAtual?.user_id)) : null;
            const cleanName = peer ? peer.nome : (c.nome || 'Canal').replace(/^Chat:\s*/i, '');

            const msgsForThisChannel = recentMsgs.filter(m => m.canal_id === c.id);

            const unreadCount = msgsForThisChannel.filter(m => {
              const lidos = m.metadata?.lidoPor || [];
              return !lidos.includes(perfilAtual?.nome) && m.sender_id !== perfilAtual?.user_id;
            }).length;

            let lastMsgText = '';
            const lastMsgObj = msgsForThisChannel[0];
            if (lastMsgObj) {
              if (lastMsgObj.metadata?.deleted) {
                lastMsgText = '🚫 Mensagem apagada';
              } else if (lastMsgObj.metadata?.buzz) {
                lastMsgText = '⚡ Chamou a atenção';
              } else if (lastMsgObj.metadata?.game) {
                lastMsgText = `🎮 Desafio: ${gameLabel((lastMsgObj.metadata.game as ChatGameState).kind)}`;
              } else {
                lastMsgText = lastMsgObj.tipo === 'image' ? '📷 Imagem anexada' : lastMsgObj.tipo === 'file' ? `📎 ${lastMsgObj.metadata?.fileName || 'Ficheiro'}` : lastMsgObj.texto;
              }
            } else {
              lastMsgText = c.is_direct ? 'Iniciar conversa' : `${listaMembros.length} participantes`;
            }

            const lastMsgTime = lastMsgObj ? formatPortalTime(lastMsgObj.created_at) : '';

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

          const canaisValidos = [...groupChats, ...Array.from(directChatsMap.values())];


          canaisValidos.sort((a, b) => {
            if (a.name === 'Geral') return -1;
            if (b.name === 'Geral') return 1;
            return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
          });

          setChannels(canaisValidos);

          // Por padrão não abre nenhuma conversa automaticamente (estilo WhatsApp Web / Telegram Desktop);
          // entra diretamente apenas quando há ?chatId=... vindo de uma notificação ou chamada de atenção.
          setActiveChatId(() => {
            if (targetId && canaisValidos.some((c) => c.id === targetId)) return targetId;
            return null;
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
      const detail = (event as CustomEvent<{chatId:string;messageId?:string;focusInput?:boolean}>).detail;
      const id=detail.chatId;
      focusedScroll.current=null;setFocusedMessageId(detail.messageId || null);
      if (!id) return;

      const focusComposerSoon = () => {
        if (!detail.focusInput) return;
        setTimeout(() => {
          inputFieldRef.current?.focus();
        }, 120);
      };

      if (channels.length > 0) {
        if (channels.some(c => c.id === id)) {
          setActiveChatId(id);
          if (typeof window !== 'undefined') window.history.replaceState(null, '', `/dashboard/conversas?chatId=${id}`);
          focusComposerSoon();
        } else {
          const { data: missingChannel } = await supabase.from('doodoo_canais').select('*').eq('id', id).single();
          if (missingChannel) {
             const peer = missingChannel.is_direct ? missingChannel.membros.find((m: Member) => m.user_id !== currentUser?.user_id) : null;
             const peerProfile = teamMembers.find(m => m.user_id === peer?.user_id);
             const cleanName = peerProfile ? peerProfile.nome : missingChannel.nome;

             const mapped: ChatChannel = {
                id: missingChannel.id, name: cleanName, isGroup: missingChannel.is_group, isDirect: missingChannel.is_direct, sector: missingChannel.setor,
                foto_url: missingChannel.foto_url, unread: 0, members: missingChannel.membros, lastMessage: 'Nova conversa iniciada',
                lastMessageTime: formatPortalTime(serverNowDate()), updatedAt: serverNowIso()
             };
             setChannels(prev => [mapped, ...prev.filter(c=>c.id!==mapped.id)].sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()));
             setActiveChatId(id);
             if (typeof window !== 'undefined') window.history.replaceState(null, '', `/dashboard/conversas?chatId=${id}`);
             focusComposerSoon();
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
    const seteDias = serverNowDate();
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
        clearTypingSender(incoming.canal_id, incoming.sender_id);
        const currentActiveId = activeChatIdRef.current;

        setChannels(prev => {
           const updatedChannels = prev.map(c => {
             if (c.id === incoming.canal_id) {
               const isCurrentlyOpen = c.id === currentActiveId;
               return {
                 ...c,
                 lastMessage: incoming.deleted
                   ? '🚫 Apagada'
                   : incoming.metadata?.buzz
                     ? '⚡ Chamou a atenção'
                     : incoming.metadata?.game
                       ? `🎮 Desafio: ${gameLabel((incoming.metadata.game as ChatGameState).kind)}`
                       : incoming.type === 'image'
                         ? '📷 Imagem anexada'
                         : incoming.type === 'file'
                           ? `📎 Ficheiro anexado`
                           : incoming.text,
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

        // Redundant Spark-style Buzz trigger inside chat view (ChatAttention deduplicates by message ID)
        // so the modal & chime NEVER miss even if layout's realtime socket is reconnecting.
        if (incoming.metadata?.buzz === true && !incoming.deleted && incoming.sender_id !== currentUser.user_id) {
          const targetChan = channelsRef.current.find((c) => c.id === incoming.canal_id);
          window.dispatchEvent(
            new CustomEvent('doodoo:chat_buzz', {
              detail: {
                id: incoming.id,
                channelId: incoming.canal_id,
                senderId: incoming.sender_id,
                sender: incoming.sender,
                channelName: targetChan?.isGroup ? targetChan.name : undefined,
                sentAt: incoming.created_at,
              },
            })
          );
        }

        if (incoming.canal_id === currentActiveId) {
          setActiveMessages(prev => {
            if (prev.some(m => m.id === incoming.id)) return prev;
            return [...prev, incoming];
          });

          if (incoming.sender_id !== currentUser.user_id) {
            if (!incoming.metadata?.buzz) playPortalSound(currentUser.user_id);
            if (currentUser.read_receipts === true) {
               void mergeMetadata(incoming.id,value=>({...value,lidoPor:Array.from(new Set([...(value.lidoPor||[]),currentUser.nome]))})).catch(()=>notifyBell('Leitura não sincronizada','Não foi possível confirmar a leitura desta mensagem.'));
            }
          }
          if(stickToBottom.current)scrollToBottom('smooth');
        } else if (incoming.sender_id !== currentUser.user_id && !incoming.metadata?.buzz) {
          playPortalSound(currentUser.user_id);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'doodoo_mensagens' }, (payload) => {
        const updated = mapDbToMessage(payload.new as unknown as MessageRow);
        if (updated.canal_id === activeChatIdRef.current) setActiveMessages(prev => prev.map(m => m.id === updated.id ? updated : m));

        setChannels(prev => prev.map(c => {
           if (c.id === updated.canal_id) {
              if (updated.deleted) return { ...c, lastMessage: '🚫 Mensagem apagada' };
              if (updated.metadata?.editedAt && updated.type === 'text' && c.updatedAt === updated.created_at) {
                return { ...c, lastMessage: updated.sender_id === currentUser.user_id ? `Você: ${updated.text}` : updated.text };
              }
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
        tickPresence(serverNowMs());
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
              lastMessageTime: formatPortalTime(newChannel.created_at || serverNowDate()), updatedAt: newChannel.created_at || serverNowIso()
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
        const members=Array.isArray(updated.membros)?updated.membros:[];
        const remains=members.some((m:Member)=>m.user_id===currentUser.user_id);
        setChannels(prev => remains?prev.map(c => c.id === updated.id ? { ...c, foto_url: updated.foto_url, members, name: c.isDirect ? c.name : updated.nome } : c):prev.filter(c=>c.id!==updated.id));
        if(!remains&&activeChatIdRef.current===updated.id){setActiveChatId(null);setIsInfoDrawerOpen(false);}
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'doodoo_canais' }, (payload) => {
        const deletedId = payload.old?.id || (payload.old as {old_record?:{id:string}})?.old_record?.id;
        if (deletedId) {
          setChannels(prev => prev.filter(c => c.id !== deletedId));
          if (activeChatIdRef.current === deletedId) { setActiveChatId(null); setIsInfoDrawerOpen(false); }
        }
      })
      .subscribe(status=>{setChatConnection(status==='SUBSCRIBED'?'Conectado':status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED'?'Reconectando…':'Conectando…');const id=activeChatIdRef.current;if(status==='SUBSCRIBED'&&id&&!id.startsWith('temp_chat_'))void fetchMessagesForActiveChannel(id);});

    return () => { supabase.removeChannel(globalSub); };
  }, [currentUser, scrollToBottom, mergeMetadata, notifyBell, fetchMessagesForActiveChannel, clearTypingSender]);

  const resolveChannel = async (requestedId:string,seed?:ChatChannel) => {
    if(!currentUser||!requestedId)throw new Error('Selecione uma conversa válida.');
    let targetChannelId=requestedId;
    if(targetChannelId.startsWith('temp_chat_')) {
      const temporaryId=targetChannelId;
      const channel=seed||channels.find(c=>c.id===temporaryId);if(!channel)throw new Error('Conversa indisponível');
      if(!directRequests.current.has(temporaryId))directRequests.current.set(temporaryId,(async()=>{
        const id=await occurrenceId('direct:'+channel.members.map(m=>m.user_id).sort().join(':'));
        const result=await supabase.from('doodoo_canais').insert({id,nome:channel.name,is_group:false,is_direct:true,membros:channel.members}).select('*').single();
        if(result.error?.code==='23505')return requireResult<ChannelRow>(await supabase.from('doodoo_canais').select('*').eq('id',id).single());
        return requireResult<ChannelRow>(result);
      })());
      try {
        const saved=await directRequests.current.get(temporaryId)!;targetChannelId=saved.id;
        setChannels(prev=>{
          const hasTemporary=prev.some(c=>c.id===temporaryId);
          return prev.filter(c=>!hasTemporary||c.id!==saved.id).map(c=>c.id===temporaryId?{...c,id:saved.id}:c);
        });
        setDrafts(prev=>({...prev,[saved.id]:prev[temporaryId]||prev[saved.id]||''}));
        if(activeChatIdRef.current===temporaryId){setActiveChatId(saved.id);window.history.replaceState(null,'','/dashboard/conversas?chatId='+saved.id);}
      }catch{directRequests.current.delete(temporaryId);throw new Error('Não foi possível iniciar a conversa. Seu conteúdo foi preservado.');}
    }
    return targetChannelId;
  };
  const sendToDatabase = async (tipo: 'text' | 'image' | 'file' | 'event', texto: string, metadata: MessageMetadata = {}, retryId?: string, requestedChannelId = activeChatIdRef.current) => {
    if (!currentUser || !requestedChannelId) return false;

    let targetChannelId = requestedChannelId;
    const nowDate = serverNowDate();
    const timeFormatted = formatPortalTime(nowDate);
    const nowIso = nowDate.toISOString();
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
      ...c,
      lastMessage: metadata.buzz
        ? '⚡ Você chamou a atenção'
        : metadata.game
          ? `🎮 Desafio: ${gameLabel((metadata.game as ChatGameState).kind)}`
          : tipo === 'text'
            ? `Você: ${texto}`
            : 'Você enviou um anexo',
      lastMessageTime: timeFormatted,
      updatedAt: nowIso
    } : c).sort((a, b) => {
       if (a.name === 'Geral') return -1;
       if (b.name === 'Geral') return 1;
       return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
    }));

    // Omit created_at on insert so PostgreSQL DEFAULT now() always stamps the canonical server timestamp,
    // preventing collaborator PC clock skew from corrupting message order or displayed times.
    const dbInsertPayload = {
      id: tempId,
      canal_id: targetChannelId,
      sender_id: currentUser.user_id,
      sender_nome: currentUser.nome,
      texto: texto,
      tipo: tipo,
      metadata: { ...metadata, lidoPor: [currentUser.nome], replyTo: replyData },
    };
    const outgoing: MessageRow = { ...dbInsertPayload, created_at: nowIso };
    const recoverable=retainOutgoing(currentUser.user_id,outgoing);
    let { data, error } = await supabase.from('doodoo_mensagens').insert([dbInsertPayload]).select().single();

    if(error?.code==='23505'){const existing=await supabase.from('doodoo_mensagens').select('*').eq('id',tempId).single();if(existing.data?.sender_id===currentUser.user_id&&existing.data?.canal_id===targetChannelId&&existing.data?.texto===texto){data=existing.data;error=null;}}
    if (data && !error) {
      confirmOutgoing(currentUser.user_id,tempId);
      const confirmedMsg = mapDbToMessage(data);
      setActiveMessages(prev => {
        if(activeChatIdRef.current!==targetChannelId)return prev;
        if (!prev.some(m => m.id === tempId)) return [...prev,confirmedMsg];
        return prev.map(m => m.id === tempId ? confirmedMsg : m);
      });
      setChannels(prev => prev.map(c => c.id === targetChannelId ? {
        ...c,
        lastMessageTime: confirmedMsg.time,
        updatedAt: confirmedMsg.created_at,
      } : c));
      return true;
    } else {
      setActiveMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'error' } : m));
      notifyBell('Falha no Envio', recoverable?'Não foi possível entregar a mensagem. Seu texto foi preservado.':'Não foi possível entregar nem salvar no dispositivo. Mantenha o chat aberto para tentar novamente.');
      return false;
    }
  };

  const acknowledgeUrgent = async (message:Message) => {
    if(!currentUser || message.deleted || message.sender_id===currentUser.user_id)return;
    const updated=await recordActions.run('ack:'+message.id,()=>mergeMetadata(message.id,value=>{
      if(value.deleted || !value.urgent)throw new Error('Esta chamada não está mais disponível.');
      return {...value,acknowledgedBy:[...new Set([...(value.acknowledgedBy||[]),currentUser.user_id])]};
    }));
    if(updated)setActiveMessages(prev=>prev.map(m=>m.id===updated.id?updated:m));
  };

  // Spark-style "Chamar atenção / Vibrar tela"
  const handleSendBuzz = async () => {
    if (!currentUser || !activeChatId) return;
    if (activeChat?.name === 'Geral' && !isCurrentAdmin) return;
    const now = serverNowMs();
    const until = buzzCooldownRef.current[activeChatId] || 0;
    if (now < until) {
      const remaining = Math.ceil((until - now) / 1000);
      notifyBell('Aguarde um momento', `Você já vibrou a tela nesta conversa. Aguarde ${remaining}s para enviar novamente.`);
      return;
    }
    let resolvedChannelId = activeChatId;
    try {
      resolvedChannelId = await resolveChannel(activeChatId);
    } catch {
      notifyBell('Conversa não iniciada', 'Não foi possível chamar atenção agora. Tente novamente.');
      return;
    }
    const nextUntil = now + BUZZ_COOLDOWN_MS;
    buzzCooldownRef.current[resolvedChannelId] = nextUntil;
    buzzCooldownRef.current[activeChatId] = nextUntil;
    setBuzzCooldownUntil((prev) => ({ ...prev, [activeChatId]: nextUntil, [resolvedChannelId]: nextUntil }));

    const buzzId = crypto.randomUUID();
    const recipientIds = (activeChat?.members || [])
      .map((m) => m.user_id)
      .filter((uid) => uid && uid !== currentUser.user_id);

    // 1. Fire instant Realtime Broadcast (<100ms delivery to modal + sound on recipient's screen)
    window.dispatchEvent(
      new CustomEvent('doodoo:send_buzz_broadcast', {
        detail: {
          id: buzzId,
          channelId: resolvedChannelId,
          channelName: activeChat?.isGroup ? activeChat.name : undefined,
          senderId: currentUser.user_id,
          sender: currentUser.nome,
          recipientIds,
          sentAt: serverNowIso(),
        },
      })
    );
    playBuzzSentSound(currentUser.user_id);

    // 2. Persist in doodoo_mensagens (also triggers postgres_changes as guaranteed fallback)
    const sent = await sendToDatabase('text', 'Chamou sua atenção!', { buzz: true }, buzzId, resolvedChannelId);
    if (!sent) {
      buzzCooldownRef.current[resolvedChannelId] = 0;
      buzzCooldownRef.current[activeChatId] = 0;
      setBuzzCooldownUntil((prev) => ({ ...prev, [activeChatId]: 0, [resolvedChannelId]: 0 }));
    } else {
      notifyBell(
        'Chamada de atenção enviada',
        activeChat?.isGroup
          ? `Você vibrou a tela dos participantes em “${activeChat.name}”.`
          : `Você vibrou a tela de ${activeChat?.name || 'seu colega'}.`
      );
    }
  };

  // Mini-jogos no chat (estilo Spark: Jogo da Velha, Ligue 4, Damas)
  const handleSendGameChallenge = async (kind: GameKind) => {
    if (!currentUser || !activeChatId) return;
    if (activeChat?.name === 'Geral' && !isCurrentAdmin) return;
    setShowGamePicker(false);
    const opponent =
      activeChat?.isDirect && directPeer
        ? { userId: directPeer.user_id, name: directPeer.nome }
        : undefined;
    const game = createGameChallenge(kind, { userId: currentUser.user_id, name: currentUser.nome }, opponent);
    await sendToDatabase('text', `Desafio de ${gameLabel(kind)}`, { game }, undefined, activeChatId);
  };

  const handleUpdateGame = async (messageId: string, nextGame: ChatGameState) => {
    setActiveMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, metadata: { ...(m.metadata || {}), game: nextGame } } : m))
    );
    const updated = await recordActions.run('game:' + messageId, () =>
      mergeMetadata(messageId, (value) => ({ ...value, game: nextGame }))
    );
    if (updated) {
      setActiveMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    }
  };

  const handleAcceptGame = async (msg: Message) => {
    if (!currentUser || !msg.metadata?.game) return;
    const nextGame = acceptGameChallenge(msg.metadata.game, { userId: currentUser.user_id, name: currentUser.nome });
    await handleUpdateGame(msg.id, nextGame);
    setActiveGameMessageId(msg.id);
  };

  const handleDeclineGame = async (msg: Message) => {
    if (!currentUser || !msg.metadata?.game) return;
    const nextGame = declineGameChallenge(msg.metadata.game, currentUser.user_id);
    await handleUpdateGame(msg.id, nextGame);
  };

  // Reações rápidas estilo WhatsApp / Telegram
  const handleToggleReaction = async (message: Message, emoji: string) => {
    if (!currentUser || message.deleted) return;
    const uid = currentUser.user_id;
    setActiveMessages((prev) =>
      prev.map((m) => {
        if (m.id !== message.id) return m;
        const currentReactions = { ...(m.metadata?.reactions || {}) };
        const users = Array.isArray(currentReactions[emoji]) ? [...currentReactions[emoji]] : [];
        const has = users.includes(uid);
        const nextUsers = has ? users.filter((id) => id !== uid) : [...users, uid];
        if (nextUsers.length === 0) delete currentReactions[emoji];
        else currentReactions[emoji] = nextUsers;
        return { ...m, metadata: { ...(m.metadata || {}), reactions: currentReactions } };
      })
    );
    const updated = await recordActions.run(`react:${message.id}:${emoji}`, () =>
      mergeMetadata(message.id, (value) => {
        if (value.deleted) return value;
        const reactions = { ...(value.reactions || {}) };
        const list = Array.isArray(reactions[emoji]) ? [...reactions[emoji]] : [];
        const nextList = list.includes(uid) ? list.filter((id) => id !== uid) : [...list, uid];
        if (nextList.length === 0) delete reactions[emoji];
        else reactions[emoji] = nextList;
        return { ...value, reactions };
      })
    );
    if (updated) setActiveMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
  };

  const handleStartEdit = (msg: Message) => {
    setReplyingTo(null);
    setEditingMessage({ id: msg.id, text: msg.text });
    setInputText(msg.text);
    setTimeout(() => {
      if (inputFieldRef.current) {
        inputFieldRef.current.focus();
        inputFieldRef.current.style.height = 'auto';
        inputFieldRef.current.style.height = Math.min(inputFieldRef.current.scrollHeight, 120) + 'px';
      }
    }, 0);
  };

  const handleCancelEdit = () => {
    setEditingMessage(null);
    setInputText('');
    if (inputFieldRef.current) inputFieldRef.current.style.height = 'auto';
  };

  const handleCopyMessage = async (msg: Message) => {
    try {
      await navigator.clipboard.writeText(msg.text);
      setCopiedMessageId(msg.id);
      setTimeout(() => setCopiedMessageId((curr) => (curr === msg.id ? null : curr)), 1800);
    } catch {
      notifyBell('Cópia indisponível', 'Não foi possível copiar a mensagem neste navegador.');
    }
  };

  const handleJumpToMessage = (messageId: string) => {
    const el = document.getElementById('chat-message-' + messageId);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setFocusedMessageId(messageId);
    focusedScroll.current = messageId;
    setTimeout(() => setFocusedMessageId((curr) => (curr === messageId ? null : curr)), 2400);
  };

  useEffect(() => {
    if (!lightboxImage) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxImage(null);
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [lightboxImage]);

  useEffect(()=>{
    if(!focusedMessageId || focusedScroll.current===focusedMessageId || !activeMessages.some(m=>m.id===focusedMessageId))return;
    focusedScroll.current=focusedMessageId;
    document.getElementById('chat-message-'+focusedMessageId)?.scrollIntoView({block:'center',behavior:'auto'});
  },[focusedMessageId,activeMessages]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || !activeChatId) return;
    const textToSend = inputText.trim();

    // Edição de mensagem enviada (estilo WhatsApp / Telegram)
    if (editingMessage) {
      const targetId = editingMessage.id;
      const original = activeMessages.find((m) => m.id === targetId);
      typing.stop();
      setEditingMessage(null);
      setInputText('');
      if (inputFieldRef.current) inputFieldRef.current.style.height = 'auto';
      if (!original || original.text === textToSend) return;
      const editedAt = new Date().toISOString();
      const nextMeta: MessageMetadata = { ...(original.metadata || {}), editedAt };
      setActiveMessages((prev) => prev.map((m) => (m.id === targetId ? { ...m, text: textToSend, metadata: nextMeta } : m)));
      const saved = await recordActions.run('edit:' + targetId, async () => {
        const res = await supabase
          .from('doodoo_mensagens')
          .update({ texto: textToSend, metadata: nextMeta })
          .eq('id', targetId)
          .select('*')
          .single();
        return mapDbToMessage(requireResult<MessageRow>(res));
      });
      if (saved) {
        setActiveMessages((prev) => prev.map((m) => (m.id === saved.id ? saved : m)));
        setChannels((prev) =>
          prev.map((c) =>
            c.id === saved.canal_id && c.updatedAt === saved.created_at ? { ...c, lastMessage: `Você: ${saved.text}` } : c
          )
        );
      } else {
        setActiveMessages((prev) => prev.map((m) => (m.id === targetId ? original : m)));
      }
      return;
    }

    const urgent=urgentChannelId===activeChatId;
    const cooldownKey='doodoo:urgent:'+currentUser?.user_id+':'+activeChatId;
    if(urgent){
      let last=0;try{last=Number(sessionStorage.getItem(cooldownKey)||0);}catch{}
      if(urgentLocks.current.has(activeChatId)||new Date().getTime()-last<60000){notifyBell('Aguarde um momento','Você já chamou a atenção desta conversa. Aguarde um minuto para outra urgência.');return;}
      urgentLocks.current.add(activeChatId);
    }
    typing.stop();
    setInputText('');
    if (inputFieldRef.current) inputFieldRef.current.style.height = 'auto';
    const id=activeChatIdRef.current;
    try {
      const sent=await sendToDatabase('text',textToSend,urgent?{urgent:true}: {},undefined,id);
      if(!sent&&id)setDrafts(prev=>({...prev,[id]:prev[id]?prev[id]+'\n'+textToSend:textToSend}));
      if(sent&&urgent){setUrgentChannelId(null);try{sessionStorage.setItem(cooldownKey,String(new Date().getTime()));}catch{}}
    } catch(error) {
      if(id)setDrafts(prev=>({...prev,[id]:prev[id]?prev[id]+'\n'+textToSend:textToSend}));
      notifyBell('Falha no envio',messageOf(error));
    } finally {if(id)urgentLocks.current.delete(id);}
  };

  const handleInputResize = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    typing.input(e.target.value);
    setInputText(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape' && editingMessage) {
      e.preventDefault();
      handleCancelEdit();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (inputText.trim()) handleSendMessage();
    }
  };

  // 🚀 ADICIONAR EMOJI AO TEXTO E FOCAR NO INPUT
  const handleEmojiSelect = (emoji: string) => {
    const nextValue = inputText + emoji;
    typing.input(nextValue);
    setInputText(nextValue);
    if (inputFieldRef.current) {
      inputFieldRef.current.focus();
    }
  };

  const uploadAttachmentFile = async (file: File, type: 'image' | 'file') => {
    if (!currentUser) return;
    if (file.size > 10 * 1024 * 1024) return notifyBell('Erro', 'O arquivo excede o limite de 10 MB.');

    try {
      notifyBell('Enviando...', 'A transferir o seu anexo para o servidor.');
      const ext = file.name.split('.').pop() || (type === 'image' ? 'png' : 'bin');
      const channelId = await resolveChannel(activeChatIdRef.current || '');
      const userId = currentUser.user_id;

      const filePath = `${channelId}/${userId}/${type}s/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('chat_midia')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from('chat_midia')
        .createSignedUrl(filePath, 15 * 60);

      if (signedUrlError) {
        notifyBell('Prévia indisponível', 'O arquivo será anexado pelo identificador. Abra o anexo para tentar renovar o acesso.');
      }

      const fileUrl = signedUrlData?.signedUrl || '';
      const fileSize = `${(file.size / (1024 * 1024)).toFixed(1)} MB`;

      if (type === 'image') {
        await sendToDatabase('image', 'Imagem anexada', { mediaUrl: fileUrl, storagePath: filePath, fileSize }, undefined, channelId);
      } else {
        await sendToDatabase('file', file.name, { fileName: file.name, fileSize, mediaUrl: fileUrl, storagePath: filePath }, undefined, channelId);
      }
    } catch {
      notifyBell('Erro de Envio', 'Não foi possível fazer o upload. O serviço pode estar indisponível.');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'file') => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadAttachmentFile(file, type);
    } finally {
      e.target.value = '';
    }
  };

  // Colar print/imagem direto com Ctrl+V (estilo WhatsApp Web / Telegram Desktop)
  const handleComposerPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          const ext = item.type.split('/')[1] || 'png';
          const namedFile = file.name ? file : new File([file], `captura-${new Date().getTime()}.${ext}`, { type: item.type });
          void uploadAttachmentFile(namedFile, 'image');
          return;
        }
      }
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
      const { error: groupMessageError } = await supabase.from('doodoo_mensagens').insert([{
        id: crypto.randomUUID(),
        canal_id: data.id,
        sender_id: currentUser.user_id,
        sender_nome: currentUser.nome,
        texto: `O grupo "${newGroupName}" foi criado.`,
        tipo: 'text',
        metadata: { lidoPor: [currentUser.nome] },
        created_at: new Date().toISOString()
      }]);
      if (groupMessageError) {
        notifyBell('Grupo criado, aviso não enviado', 'O grupo foi salvo, mas a mensagem automática não pôde ser registrada.');
      }
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
    try{await resolveChannel(tempId,newDirect);}catch{notifyBell('Conversa ainda não conectada','Você pode escrever; ao enviar, vamos tentar conectar novamente.');}
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
    const list = !searchQuery.trim() ? channels : channels.filter(c => searchKey(c.name).includes(searchKey(searchQuery)));
    return list.filter(c=>chatFilter==='all'||chatFilter==='unread'&&c.unread>0||chatFilter==='groups'&&c.isGroup).sort((a, b) => {
       if (a.name === 'Geral') return -1;
       if (b.name === 'Geral') return 1;
       return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
    });
  }, [channels, searchQuery,chatFilter]);

  const filteredMessages = useMemo(() => {
    if (!messageSearch.trim()) return activeMessages;
    return activeMessages.filter(m => searchKey(m.text).includes(searchKey(messageSearch)) || searchKey(m.sender).includes(searchKey(messageSearch)));
  }, [activeMessages, messageSearch]);

  if (isLoading) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-brand-panel" />
        <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
          Conectando às conversas...
        </span>
      </div>
    );
  }

  if (authError || !currentUser) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center px-4">
        <div
          className="max-w-sm w-full p-8 rounded-2xl border text-center space-y-4"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)', boxShadow: 'var(--shadow-card)' }}
        >
          <div className="w-14 h-14 mx-auto rounded-2xl bg-red-500/10 flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 text-[var(--error-text)]" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold tracking-tight">Sessão Expirada</h3>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Não foi possível validar as suas credenciais no Chat Corporativo.
            </p>
          </div>
          <button
            type="button"
            onClick={handleForceLogout}
            className="w-full py-3 rounded-xl text-white text-xs font-semibold cursor-pointer flex items-center justify-center gap-2 hover:brightness-105 transition-all"
            style={primaryActionStyle}
          >
            <LogOut className="w-4 h-4" />
            <span>Fazer Login Novamente</span>
          </button>
        </div>
      </div>
    );
  }

  const isConnected = chatConnection.toLowerCase().includes('conectado') && !chatConnection.toLowerCase().includes('desconectado');

  return (
    <div className="chat-workspace w-full h-full min-h-0 min-w-0 flex-1 flex flex-col pb-0 relative z-0">
      <input type="file" ref={imageInputRef} onChange={(e) => handleFileUpload(e, 'image')} accept="image/*" className="hidden" />
      <input type="file" ref={fileInputRef} onChange={(e) => handleFileUpload(e, 'file')} accept=".pdf,.doc,.docx,.xls,.xlsx,.txt" className="hidden" />

      {/* SHELL PRINCIPAL DO CHAT V2 */}
      <div
        className="chat-shell w-full flex-1 flex flex-col lg:flex-row rounded-none md:rounded-2xl border-t md:border overflow-hidden relative z-10"
        style={{
          backgroundColor: 'var(--bg-card)',
          borderColor: 'var(--border-input)',
          boxShadow: 'var(--shadow-card, 0 1px 2px rgb(15 23 42 / 0.04))',
        }}
      >
        {/* COLUNA 1: LISTA DE CONVERSAS */}
        <div
          className={`chat-sidebar flex flex-col w-full flex-1 lg:flex-none lg:w-[324px] xl:w-[356px] h-full min-h-0 flex-shrink-0 border-r transition-all duration-200 ${
            activeChatId ? 'hidden lg:flex' : 'flex'
          }`}
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}
        >
          <div className="space-y-3.5 p-4 md:p-5 pb-3.5 border-b" style={{ borderColor: 'var(--border-input)' }}>
            {/* Cabeçalho + Estado da Conexão */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="chat-brand-icon">
                  <MessageSquare className="w-[18px] h-[18px]" />
                </span>
                <div className="min-w-0">
                  <h3 className="font-bold text-[15px] tracking-tight truncate">Chat Corporativo</h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        isConnected ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
                      }`}
                    />
                    <p className="text-[11px] font-medium truncate" style={{ color: 'var(--text-muted)' }}>
                      {chatConnection}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Minha Presença */}
            <div
              className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border text-xs font-semibold"
              style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                    userStatus === 'online'
                      ? 'bg-emerald-500'
                      : userStatus === 'ausente'
                        ? 'bg-amber-500 animate-pulse'
                        : userStatus === 'ocupado'
                          ? 'bg-red-500'
                          : userStatus === 'indisponivel'
                            ? 'bg-purple-500'
                            : 'bg-slate-400'
                  }`}
                />
                <span className="truncate text-[13px]">{currentUser.nome}</span>
              </div>
              <select
                aria-label="Meu status no chat"
                aria-busy={presence.sync === 'saving'}
                value={presence.preference}
                onChange={(e) => presence.choose(e.target.value as UserStatusType)}
                className="bg-transparent text-[11px] uppercase font-bold outline-none cursor-pointer flex-shrink-0 text-right"
                style={{ color: 'var(--text-muted)' }}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {isDoNotDisturb(userStatus) && (
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-semibold border"
                style={{
                  backgroundColor: 'color-mix(in srgb, #ef4444 8%, var(--bg-card))',
                  borderColor: 'color-mix(in srgb, #ef4444 25%, var(--border-input))',
                  color: 'var(--error-text)',
                }}
              >
                <VolumeX className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Não incomodar ativo — sons, pop-ups e vibrações silenciados.</span>
              </div>
            )}

            {presence.sync === 'error' && (
              <p className="chat-presence-feedback" role="status">
                Não foi possível atualizar sua presença.{' '}
                <button type="button" onClick={presence.retry}>
                  Tentar novamente
                </button>
              </p>
            )}
            {presence.status === 'ausente' && presence.preference === 'online' && (
              <p className="chat-presence-feedback">Ausente por inatividade. Seu status volta ao usar o portal.</p>
            )}

            {/* Título + Novo Grupo + Busca */}
            <div className="space-y-2.5 pt-0.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="chat-accent-bar" aria-hidden="true" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--text-muted)' }}>
                    Canais e Diretos
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsGroupModalOpen(true)}
                  className="text-[11.5px] font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                  style={{ color: 'var(--tab-active)' }}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>+ Novo Grupo</span>
                </button>
              </div>
              <div className="relative w-full">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Iniciar ou procurar conversa..."
                  className="w-full pl-9 pr-8 py-2.5 rounded-xl border text-sm font-medium outline-none focus:border-brand-panel transition-colors"
                  style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
                />
                {searchQuery && (
                  <button
                    type="button"
                    aria-label="Limpar busca de conversas"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-[var(--surface-hover)] cursor-pointer"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div
            className="flex-1 overflow-y-auto px-3.5 py-3.5 md:px-4 custom-scrollbar space-y-1.5"
            style={{ backgroundColor: 'var(--bg-page)' }}
          >
            {searchQuery.trim() !== '' && filteredTeamMembers.length > 0 && (
              <div className="mb-3 space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-[0.12em] px-1 block" style={{ color: 'var(--text-muted)' }}>
                  Colaboradores
                </span>
                {filteredTeamMembers.map((colab) => {
                  const peerStatus = getRealUserStatus(colab, presenceTime);
                  return (
                    <button
                      type="button"
                      key={colab.user_id}
                      onClick={() => handleOpenDirectChat(colab)}
                      className="w-full text-left p-3 rounded-xl border transition-all cursor-pointer flex items-center gap-3 hover:border-[var(--tab-active)]"
                      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}
                    >
                      <div className="chat-avatar relative flex-shrink-0">
                        {colab.avatar_url ? (
                          <img src={colab.avatar_url} alt="" className="w-10 h-10 rounded-xl object-cover border" style={{ borderColor: 'var(--border-input)' }} />
                        ) : (
                          <div className="w-10 h-10 rounded-xl text-white font-semibold flex items-center justify-center text-xs" style={primaryActionStyle}>
                            {getInitials(colab.nome)}
                          </div>
                        )}
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 ${peerStatus.color}`}
                          style={{ borderColor: 'var(--bg-card)' }}
                        />
                      </div>
                      <div className="truncate flex-1 min-w-0">
                        <p className="text-[13.5px] font-semibold truncate">{colab.nome}</p>
                        <p className="text-[11px] font-medium truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                          {colab.setor} · {peerStatus.label}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="chat-list-filters" aria-label="Filtrar conversas">
              {[
                { id: 'all', label: 'Todas' },
                { id: 'unread', label: 'Não lidas' },
                { id: 'groups', label: 'Grupos' },
              ].map((filter) => (
                <button
                  type="button"
                  key={filter.id}
                  aria-pressed={chatFilter === filter.id}
                  onClick={() => setChatFilter(filter.id as typeof chatFilter)}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            {filteredChannels.length === 0 && <p className="chat-filter-empty">Nenhuma conversa neste filtro.</p>}

            {filteredChannels.map((chat) => {
              const isActive = chat.id === activeChatId;
              const isGeneralGroup = chat.name === 'Geral';
              const peerForChannel = chat.isDirect
                ? teamMembers.find((m) => chat.members.some((mem) => mem.user_id === m.user_id && mem.user_id !== currentUser?.user_id))
                : null;
              const displayName = peerForChannel ? peerForChannel.nome : chat.name.replace(/^Chat:\s*/i, '');

              return (
                <button
                  type="button"
                  key={chat.id}
                  data-chat-row
                  aria-pressed={isActive}
                  onClick={() => {
                    setActiveChatId(chat.id);
                    setIsInfoDrawerOpen(false);
                    if (typeof window !== 'undefined') window.history.replaceState(null, '', `/dashboard/conversas?chatId=${chat.id}`);
                  }}
                  className="chat-row w-full text-left p-3 rounded-xl border transition-all cursor-pointer flex items-center gap-3"
                  style={!isActive ? { backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' } : undefined}
                >
                  <div className="chat-avatar relative flex-shrink-0">
                    {isGeneralGroup ? (
                      <div
                        className="w-11 h-11 rounded-xl flex items-center justify-center"
                        style={
                          isActive
                            ? primaryActionStyle
                            : {
                                backgroundColor: 'color-mix(in srgb, var(--tab-active) 11%, var(--bg-card))',
                                color: 'var(--tab-active)',
                              }
                        }
                      >
                        <Megaphone className={`w-5 h-5 ${isActive ? 'text-white' : ''}`} />
                      </div>
                    ) : chat.foto_url ? (
                      <img src={chat.foto_url} alt="" className="w-11 h-11 rounded-xl object-cover border" style={{ borderColor: 'var(--border-input)' }} />
                    ) : peerForChannel?.avatar_url ? (
                      <img src={peerForChannel.avatar_url} alt="" className="w-11 h-11 rounded-xl object-cover border" style={{ borderColor: 'var(--border-input)' }} />
                    ) : (
                      <div className="w-11 h-11 rounded-xl text-white font-semibold flex items-center justify-center text-xs" style={primaryActionStyle}>
                        {getInitials(displayName)}
                      </div>
                    )}
                    {chat.isDirect && peerForChannel && (
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 ${getRealUserStatus(peerForChannel, presenceTime).color}`}
                        style={{ borderColor: 'var(--bg-card)' }}
                      />
                    )}
                  </div>
                  <div className="overflow-hidden flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[13.5px] font-semibold truncate">{displayName}</p>
                      {chat.lastMessageTime && (
                        <span className="text-[10.5px] font-medium flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                          {chat.lastMessageTime}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className="text-[12px] truncate font-medium" style={{ color: 'var(--text-muted)' }}>
                        {typing.label(chat.id) ? (
                          <span className="chat-typing-text">{typing.label(chat.id)}</span>
                        ) : (
                          chat.lastMessage ||
                          (chat.isDirect ? getRealUserStatus(peerForChannel, presenceTime).label : `${chat.members.length} membros`)
                        )}
                      </p>
                      {chat.unread > 0 && !isActive && (
                        <span className="px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none flex-shrink-0">
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

        {/* COLUNA 2: ÁREA DO CHAT */}
        {activeChat ? (
          <div
            className={`min-h-0 min-w-0 flex-1 flex-col h-full overflow-hidden transition-all relative w-full ${
              !activeChatId ? 'hidden lg:flex' : isInfoDrawerOpen ? 'hidden xl:flex' : 'flex'
            }`}
            style={{ backgroundColor: 'var(--bg-card)' }}
          >
            {/* CABEÇALHO DA CONVERSA V2 */}
            <div
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                  event.preventDefault();
                  event.currentTarget.click();
                }
              }}
              onClick={() => setIsInfoDrawerOpen(!isInfoDrawerOpen)}
              className="chat-conversation-header border-b flex items-center justify-between cursor-pointer hover:bg-[var(--surface-hover)] transition-colors z-10 flex-shrink-0"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}
            >
              <div className="chat-header-identity flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  aria-label="Voltar"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveChatId(null);
                    if (typeof window !== 'undefined') window.history.replaceState(null, '', '/dashboard/conversas');
                  }}
                  className="lg:hidden p-2 -ml-1.5 rounded-xl hover:bg-[var(--surface-hover)] cursor-pointer text-brand-panel font-semibold text-sm transition-colors flex items-center"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="chat-avatar relative flex-shrink-0">
                  {activeChat.name === 'Geral' ? (
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center border"
                      style={{
                        backgroundColor: 'color-mix(in srgb, var(--tab-active) 11%, var(--bg-card))',
                        color: 'var(--tab-active)',
                        borderColor: 'color-mix(in srgb, var(--tab-active) 22%, transparent)',
                      }}
                    >
                      <Megaphone className="w-5 h-5" />
                    </div>
                  ) : activeChat.foto_url ? (
                    <img src={activeChat.foto_url} alt="" className="w-10 h-10 rounded-xl object-cover border" style={{ borderColor: 'var(--border-input)' }} />
                  ) : directPeer?.avatar_url ? (
                    <img src={directPeer.avatar_url} alt="" className="w-10 h-10 rounded-xl object-cover border" style={{ borderColor: 'var(--border-input)' }} />
                  ) : (
                    <div className="w-10 h-10 rounded-xl text-white font-semibold flex items-center justify-center text-xs" style={primaryActionStyle}>
                      {getInitials(directPeer ? directPeer.nome : activeChat.name)}
                    </div>
                  )}
                  {activeChat.isDirect && directPeer && (
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 ${getRealUserStatus(directPeer, presenceTime).color}`}
                      style={{ borderColor: 'var(--bg-card)' }}
                    />
                  )}
                </div>
                <div className="flex flex-col min-w-0">
                  <h3 className="chat-person-title text-[15px] md:text-base font-bold leading-tight">
                    {directPeer ? directPeer.nome : activeChat.name}
                  </h3>
                  <p className="text-xs font-medium truncate max-w-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {typing.label(activeChat.id) ? (
                      <span className="chat-typing-text">{typing.label(activeChat.id)}</span>
                    ) : activeChat.isDirect && directPeer ? (
                      `${getRealUserStatus(directPeer, presenceTime).label} · ${getRealUserStatus(directPeer, presenceTime).lastSeenText}`
                    ) : (
                      <span title="Clique para ver detalhes do grupo">{formatGroupMembers(activeChat.members, currentUser.user_id)}</span>
                    )}
                  </p>
                </div>
              </div>

              <div
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault();
                    event.currentTarget.click();
                  }
                }}
                className="hidden sm:flex items-center gap-2 flex-shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    value={messageSearch}
                    onChange={(e) => setMessageSearch(e.target.value)}
                    placeholder="Pesquisar..."
                    aria-label="Pesquisar nesta conversa"
                    className="w-44 lg:w-52 pl-8 pr-7 py-2 rounded-xl border text-xs font-medium outline-none focus:border-brand-panel transition-colors"
                    style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
                  />
                  {messageSearch && (
                    <button
                      type="button"
                      aria-label="Limpar busca na conversa"
                      onClick={() => setMessageSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-[var(--surface-hover)] cursor-pointer"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* STREAM DE MENSAGENS */}
            <div
              onScroll={(event) => {
                const el = event.currentTarget;
                stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
                setAwayFromBottom(!stickToBottom.current);
              }}
              className="chat-message-list flex-1 overflow-y-auto space-y-2 custom-scrollbar"
              style={{ backgroundColor: 'var(--bg-page)' }}
            >
              {filteredMessages.map((msg, index) => {
                const isMe = msg.sender_id === currentUser.user_id;
                const hasAccepted = msg.acceptedBy?.includes(currentUser.nome);
                const otherReaders = (msg.lidoPor || []).filter((nome) => nome !== currentUser.nome);
                const isRead = otherReaders.length > 0;
                const isBuzz = msg.metadata?.buzz === true && !msg.deleted;
                const reactionEntries = Object.entries(msg.metadata?.reactions || {}).filter(
                  ([, users]) => Array.isArray(users) && users.length > 0
                );
                const showDateChip = index === 0 || filteredMessages[index - 1].dateLabel !== msg.dateLabel;
                const showTail =
                  index === 0 ||
                  filteredMessages[index - 1].sender_id !== msg.sender_id ||
                  filteredMessages[index - 1].metadata?.buzz === true ||
                  showDateChip;

                if (isBuzz) {
                  return (
                    <div
                      key={msg.id}
                      id={'chat-message-' + msg.id}
                      data-message-id={msg.id}
                      data-highlighted={focusedMessageId === msg.id}
                      className={`flex flex-col items-center ${showDateChip ? 'mt-5' : 'mt-3'}`}
                    >
                      {showDateChip && (
                        <div className="flex justify-center w-full my-4">
                          <span
                            className="px-3.5 py-1 rounded-full text-[10.5px] font-bold uppercase tracking-wider border"
                            style={{
                              backgroundColor: 'var(--bg-card)',
                              borderColor: 'var(--border-input)',
                              color: 'var(--text-muted)',
                              boxShadow: 'var(--shadow-card)',
                            }}
                          >
                            {msg.dateLabel}
                          </span>
                        </div>
                      )}
                      <div className="chat-buzz-pill">
                        <Zap className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>
                          {isMe ? 'Você vibrou a tela nesta conversa' : `${msg.sender} chamou sua atenção!`}
                        </span>
                        <span className="opacity-70 text-[10.5px]">· {msg.time}</span>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={msg.id}
                    id={'chat-message-' + msg.id}
                    data-message-id={msg.id}
                    data-highlighted={focusedMessageId === msg.id}
                    className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} ${showDateChip ? 'mt-5' : 'mt-1.5'}`}
                  >
                    {showDateChip && (
                      <div className="flex justify-center w-full my-4">
                        <span
                          className="px-3.5 py-1 rounded-full text-[10.5px] font-bold uppercase tracking-wider border"
                          style={{
                            backgroundColor: 'var(--bg-card)',
                            borderColor: 'var(--border-input)',
                            color: 'var(--text-muted)',
                            boxShadow: 'var(--shadow-card)',
                          }}
                        >
                          {msg.dateLabel}
                        </span>
                      </div>
                    )}

                    <div className="flex flex-col group relative max-w-[85%] sm:max-w-[74%]">
                      {msg.deleted ? (
                        <div
                          className="px-4 py-2.5 rounded-2xl text-xs italic flex items-center gap-2 border font-medium"
                          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)', color: 'var(--text-muted)' }}
                        >
                          <span>Mensagem eliminada</span>
                        </div>
                      ) : (
                        <>
                          <div
                            data-side={isMe ? 'right' : 'left'}
                            className="chat-message-actions absolute flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <div className="hidden sm:flex items-center gap-0.5 pr-1 mr-0.5 border-r" style={{ borderColor: 'var(--border-input)' }}>
                              {QUICK_REACTIONS.map((emoji) => (
                                <button
                                  key={emoji}
                                  type="button"
                                  aria-label={`Reagir com ${emoji}`}
                                  onClick={() => void handleToggleReaction(msg, emoji)}
                                  className="w-6 h-6 flex items-center justify-center rounded-md text-[13px] hover:bg-[var(--surface-hover)] hover:scale-110 transition-transform cursor-pointer"
                                  title={`Reagir com ${emoji}`}
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                            <button
                              aria-label="Responder"
                              type="button"
                              onClick={() => {
                                setEditingMessage(null);
                                setReplyingTo({ id: msg.id, sender: msg.sender, text: msg.text });
                                inputFieldRef.current?.focus();
                              }}
                              className="p-1.5 hover:bg-[var(--surface-hover)] rounded-lg transition-colors cursor-pointer"
                              style={{ color: 'var(--text-muted)' }}
                              title="Responder"
                            >
                              <Reply className="w-3.5 h-3.5" />
                            </button>
                            {msg.type === 'text' && !msg.metadata?.game && (
                              <button
                                aria-label="Copiar mensagem"
                                type="button"
                                onClick={() => void handleCopyMessage(msg)}
                                className="p-1.5 hover:bg-[var(--surface-hover)] rounded-lg transition-colors cursor-pointer"
                                style={{ color: copiedMessageId === msg.id ? 'var(--typing-accent, #16a34a)' : 'var(--text-muted)' }}
                                title={copiedMessageId === msg.id ? 'Copiado!' : 'Copiar'}
                              >
                                {copiedMessageId === msg.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                            )}
                            {isMe && msg.type === 'text' && !msg.metadata?.game && (
                              <button
                                aria-label="Editar mensagem"
                                type="button"
                                onClick={() => handleStartEdit(msg)}
                                className="p-1.5 hover:bg-[var(--surface-hover)] rounded-lg transition-colors cursor-pointer"
                                style={{ color: 'var(--text-muted)' }}
                                title="Editar"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {isMe && (
                              <button
                                aria-label="Apagar"
                                type="button"
                                onClick={() => confirmDeleteMessage(msg.id)}
                                className="p-1.5 text-[var(--error-text)] hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                                title="Apagar"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          <div
                            data-urgent={msg.metadata?.urgent === true}
                            className={`chat-bubble rounded-2xl relative ${isMe ? 'text-white' : ''} ${
                              showTail ? (isMe ? 'rounded-tr-sm' : 'rounded-tl-sm') : ''
                            }`}
                            style={
                              isMe
                                ? primaryActionStyle
                                : { backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-input)', color: 'var(--text-main)' }
                            }
                          >
                            {!isMe && !activeChat.isDirect && showTail && (
                              <span className="text-[11px] font-bold text-brand-panel block mb-1 tracking-wide">{msg.sender}</span>
                            )}
                            {msg.metadata?.urgent && (
                              <div className="chat-urgent-label">
                                <BellRing size={13} />
                                Mensagem urgente
                              </div>
                            )}
                            {msg.replyTo && (
                              <button
                                type="button"
                                onClick={() => handleJumpToMessage(msg.replyTo!.id)}
                                className={`w-full text-left mb-2 px-3 py-2 rounded-xl border-l-[3px] text-xs cursor-pointer transition-opacity hover:opacity-90 ${
                                  isMe ? 'bg-black/20 border-white/75 text-white' : 'bg-[var(--bg-input)] border-[var(--tab-active)]'
                                }`}
                                title="Ir para a mensagem original"
                              >
                                <p className="font-bold text-[11px] mb-0.5">{msg.replyTo.sender}</p>
                                <p className="truncate opacity-80">{msg.replyTo.text}</p>
                              </button>
                            )}

                            {msg.type === 'image' && !msg.mediaUrl && msg.metadata?.storagePath ? (
                              <a
                                href="#"
                                onClick={(event) => {
                                  void openAttachment(event, msg);
                                }}
                                className="underline"
                              >
                                Abrir imagem
                              </a>
                            ) : msg.type === 'image' && msg.mediaUrl ? (
                              <button
                                type="button"
                                onClick={() => setLightboxImage({ url: msg.mediaUrl!, fileName: msg.fileName || 'imagem.png' })}
                                className="space-y-1 mb-1.5 block cursor-zoom-in text-left"
                                aria-label="Ampliar imagem"
                              >
                                <img
                                  src={msg.mediaUrl}
                                  alt="Mídia"
                                  className="max-w-full sm:max-w-xs max-h-64 object-cover rounded-xl border border-black/10 hover:opacity-95 transition-opacity"
                                />
                              </button>
                            ) : msg.type === 'file' ? (
                              <div className="flex items-center gap-3 pr-2 pb-1">
                                <div
                                  className={`p-2.5 rounded-xl ${isMe ? 'bg-white/20 text-white' : ''}`}
                                  style={
                                    !isMe
                                      ? {
                                          backgroundColor: 'color-mix(in srgb, var(--tab-active) 10%, var(--bg-card))',
                                          color: 'var(--tab-active)',
                                        }
                                      : undefined
                                  }
                                >
                                  <FileText className="w-5 h-5" />
                                </div>
                                <div className="overflow-hidden flex-1 min-w-[150px]">
                                  <a
                                    onClick={(event) => {
                                      void openAttachment(event, msg);
                                    }}
                                    href={msg.mediaUrl || '#'}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[13.5px] font-semibold truncate hover:underline cursor-pointer block"
                                  >
                                    {msg.fileName}
                                  </a>
                                  <p className="text-[11px] font-medium opacity-75 mt-0.5">{msg.fileSize}</p>
                                </div>
                                <a
                                  onClick={(event) => {
                                    void openAttachment(event, msg);
                                  }}
                                  href={msg.mediaUrl || '#'}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  download={msg.fileName}
                                  className="p-2 rounded-xl hover:bg-black/10 cursor-pointer transition-colors"
                                  title="Baixar Arquivo"
                                >
                                  <Download className="w-4 h-4" />
                                </a>
                              </div>
                            ) : msg.type === 'event' && msg.eventDetails ? (
                              <div className="space-y-2 min-w-[220px] pb-1">
                                <div className="flex items-center gap-1.5 text-[10.5px] font-bold opacity-90 uppercase tracking-wider">
                                  <Calendar className="w-3.5 h-3.5" />
                                  <span>Reunião Agendada</span>
                                </div>
                                <h4 className="text-[14.5px] font-bold leading-snug break-words">{msg.eventDetails.title}</h4>
                                <p className="text-xs font-medium opacity-85">
                                  {msg.eventDetails.date} às {msg.eventDetails.time}
                                  {msg.eventDetails.location ? ` · ${msg.eventDetails.location}` : ''}
                                </p>
                                <div
                                  className={`pt-2.5 mt-2 border-t flex items-center justify-between gap-2 text-xs ${
                                    isMe ? 'border-white/20' : 'border-[var(--border-input)]'
                                  }`}
                                >
                                  <span className="opacity-80 font-medium">{msg.acceptedBy?.length || 0} confirmados</span>
                                  <button
                                    type="button"
                                    onClick={() => handleAcceptChatEvent(msg)}
                                    disabled={hasAccepted}
                                    className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                                      hasAccepted
                                        ? 'bg-emerald-500 text-white'
                                        : isMe
                                          ? 'bg-white text-slate-900 hover:bg-slate-100'
                                          : 'text-white hover:brightness-105'
                                    }`}
                                    style={!hasAccepted && !isMe ? primaryActionStyle : undefined}
                                  >
                                    <Check className="w-3.5 h-3.5 inline mr-1" />
                                    {hasAccepted ? 'Presença Confirmada' : 'Confirmar'}
                                  </button>
                                </div>
                              </div>
                            ) : msg.metadata?.game ? (
                              (() => {
                                const game = msg.metadata.game as ChatGameState;
                                const mySide = playerSide(game, currentUser.user_id);
                                const canAccept =
                                  game.status === 'waiting' &&
                                  currentUser.user_id !== game.challenger.userId &&
                                  (!game.opponent || game.opponent.userId === currentUser.user_id);
                                const isMyTurnNow = game.status === 'playing' && mySide !== null && game.turn === mySide;
                                const activeTurnName =
                                  game.turn === 'p1'
                                    ? game.challenger.name.split(' ')[0]
                                    : game.opponent?.name.split(' ')[0] || 'Oponente';
                                const winnerName =
                                  game.winner === 'p1'
                                    ? game.challenger.name.split(' ')[0]
                                    : game.opponent?.name.split(' ')[0] || 'Oponente';

                                return (
                                  <div className="space-y-2.5 min-w-[235px] pb-1">
                                    <div className="flex items-center gap-1.5 text-[10.5px] font-bold opacity-90 uppercase tracking-wider">
                                      <Gamepad2 className="w-3.5 h-3.5" />
                                      <span>Jogo no Chat</span>
                                    </div>
                                    <div>
                                      <h4 className="text-[15px] font-bold leading-snug">{gameLabel(game.kind)}</h4>
                                      <p className="text-xs font-medium opacity-85 mt-0.5">
                                        {game.challenger.name.split(' ')[0]} vs{' '}
                                        {game.opponent ? game.opponent.name.split(' ')[0] : 'Desafio aberto'}
                                      </p>
                                    </div>
                                    <div
                                      className={`pt-2.5 mt-1 border-t flex flex-wrap items-center justify-between gap-2 text-xs ${
                                        isMe ? 'border-white/20' : 'border-[var(--border-input)]'
                                      }`}
                                    >
                                      <span className="font-semibold opacity-90 inline-flex items-center gap-1">
                                        {game.status === 'waiting' && 'Aguardando resposta…'}
                                        {game.status === 'declined' && 'Convite recusado'}
                                        {game.status === 'playing' &&
                                          (isMyTurnNow ? 'Sua vez de jogar!' : `Vez de ${activeTurnName}`)}
                                        {game.status === 'finished' && (
                                          <>
                                            <Trophy className="w-3.5 h-3.5" />
                                            {game.winner === 'draw' ? 'Empate!' : `Vitória de ${winnerName}!`}
                                          </>
                                        )}
                                      </span>

                                      {canAccept ? (
                                        <div className="flex items-center gap-1.5">
                                          <button
                                            type="button"
                                            onClick={() => void handleDeclineGame(msg)}
                                            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                                              isMe
                                                ? 'bg-white/15 hover:bg-white/25 text-white'
                                                : 'border border-[var(--border-input)] hover:bg-[var(--surface-hover)]'
                                            }`}
                                          >
                                            Recusar
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => void handleAcceptGame(msg)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                                              isMe ? 'bg-white text-slate-900 hover:bg-slate-100' : 'text-white hover:brightness-105'
                                            }`}
                                            style={!isMe ? primaryActionStyle : undefined}
                                          >
                                            Aceitar e Jogar
                                          </button>
                                        </div>
                                      ) : game.status !== 'declined' ? (
                                        <button
                                          type="button"
                                          onClick={() => setActiveGameMessageId(msg.id)}
                                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                                            isMe ? 'bg-white text-slate-900 hover:bg-slate-100' : 'text-white hover:brightness-105'
                                          }`}
                                          style={!isMe ? primaryActionStyle : undefined}
                                        >
                                          {game.status === 'finished' ? 'Ver / Revanche' : 'Abrir tabuleiro'}
                                        </button>
                                      ) : null}
                                    </div>
                                  </div>
                                );
                              })()
                            ) : (
                              <div className="whitespace-pre-wrap break-words">{formatLinks(msg.text)}</div>
                            )}

                            {msg.metadata?.urgent && (
                              <div className="chat-acknowledgement">
                                {!isMe && (
                                  <button
                                    type="button"
                                    disabled={recordActions.pending > 0 || msg.metadata.acknowledgedBy?.includes(currentUser.user_id)}
                                    onClick={() => acknowledgeUrgent(msg)}
                                  >
                                    {msg.metadata.acknowledgedBy?.includes(currentUser.user_id) ? 'Você confirmou ciência' : 'Ciente'}
                                  </button>
                                )}
                                <span>
                                  {msg.metadata.acknowledgedBy?.length
                                    ? msg.metadata.acknowledgedBy.length +
                                      ' ' +
                                      (msg.metadata.acknowledgedBy.length === 1 ? 'pessoa ciente' : 'pessoas cientes')
                                    : 'Aguardando confirmação'}
                                </span>
                              </div>
                            )}

                            <div
                              className={`float-right flex items-center gap-1 ml-3 mt-1.5 text-[10.5px] font-medium ${
                                isMe ? 'text-white/80' : 'text-[var(--text-muted)]'
                              }`}
                            >
                              {msg.metadata?.editedAt && <span className="italic opacity-80">editada ·</span>}
                              <span>{msg.time}</span>
                              {msg.status === 'error' && (
                                <button
                                  type="button"
                                  aria-label="Reenviar mensagem"
                                  className="underline font-semibold ml-1 cursor-pointer"
                                  onClick={async () => {
                                    if (await sendToDatabase(msg.type, msg.text, msg.metadata || {}, msg.id, msg.canal_id)) {
                                      setDrafts((prev) => (prev[msg.canal_id] === msg.text ? { ...prev, [msg.canal_id]: '' } : prev));
                                    }
                                  }}
                                >
                                  Reenviar
                                </button>
                              )}
                              {isMe &&
                                (msg.status === 'sending' ? (
                                  <Clock className="w-3 h-3 animate-spin" aria-label="Enviando" />
                                ) : msg.status === 'error' ? (
                                  <AlertTriangle className="w-3 h-3 text-red-200" aria-label="Erro ao enviar" />
                                ) : isRead ? (
                                  <span title={`Lida por ${otherReaders.join(', ')}`} className="inline-flex">
                                    <CheckCheck className="w-3.5 h-3.5 text-sky-300" />
                                  </span>
                                ) : (
                                  <span title="Entregue" className="inline-flex">
                                    <Check className="w-3.5 h-3.5 opacity-75" />
                                  </span>
                                ))}
                            </div>
                            <div className="clear-both" />
                          </div>

                          {reactionEntries.length > 0 && (
                            <div className={`chat-reaction-bar flex flex-wrap gap-1 mt-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                              {reactionEntries.map(([emoji, users]) => {
                                const reactedByMe = users.includes(currentUser.user_id);
                                const names = users
                                  .map((uid) => (uid === currentUser.user_id ? 'Você' : teamMembers.find((m) => m.user_id === uid)?.nome || 'Colega'))
                                  .join(', ');
                                return (
                                  <button
                                    key={emoji}
                                    type="button"
                                    aria-label={`Reação ${emoji} (${users.length})`}
                                    onClick={() => void handleToggleReaction(msg, emoji)}
                                    title={names}
                                    className="chat-reaction-chip"
                                    data-mine={reactedByMe}
                                  >
                                    <span>{emoji}</span>
                                    {users.length > 1 && <span>{users.length}</span>}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}

              {activeMessages.length === 0 && activeTypers.length === 0 && (
                <div className="h-full min-h-[260px] flex flex-col items-center justify-center text-center gap-3 px-4">
                  <div className="chat-brand-icon w-12 h-12 rounded-2xl">
                    <MessageSquare className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">O histórico de conversa inicia aqui.</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                      Envie uma mensagem, anexo ou agende uma reunião com a equipe.
                    </p>
                  </div>
                </div>
              )}

              {activeTypers.length > 0 && (
                <div className="flex flex-col items-start mt-2" aria-live="polite">
                  <div
                    className="chat-typing-bubble rounded-2xl rounded-tl-sm border"
                    style={{
                      backgroundColor: 'var(--bg-card)',
                      borderColor: 'var(--border-input)',
                    }}
                  >
                    {!activeChat.isDirect && (
                      <span
                        className="text-[11px] font-bold block mb-1 tracking-wide"
                        style={{ color: 'var(--typing-accent, #16a34a)' }}
                      >
                        {activeTypers.length === 1
                          ? activeTypers[0].name.split(' ')[0]
                          : activeTypers.length === 2
                            ? `${activeTypers[0].name.split(' ')[0]} e ${activeTypers[1].name.split(' ')[0]}`
                            : `${activeTypers
                                .slice(0, 2)
                                .map((m) => m.name.split(' ')[0])
                                .join(', ')} e outros`}
                      </span>
                    )}
                    <div className="chat-typing-dots" role="status" aria-label={typing.label(activeChat.id)}>
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {awayFromBottom && (
              <button
                type="button"
                className="chat-jump-latest"
                onClick={() => {
                  stickToBottom.current = true;
                  setAwayFromBottom(false);
                  scrollToBottom('auto');
                }}
              >
                <ArrowDown size={14} />
                Mensagens recentes
              </button>
            )}

            {/* CAIXAS FLUTUANTES (RESPONDER, EMOJIS E JOGOS) */}
            <div className="relative">
              {showGamePicker && (
                <div
                  className="absolute bottom-full left-4 md:left-6 mb-2 p-3 w-[275px] max-w-[calc(100vw-2rem)] rounded-2xl border z-20 space-y-1.5"
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    borderColor: 'var(--border-input)',
                    boxShadow: 'var(--shadow-card-hover)',
                  }}
                >
                  <div className="flex items-center justify-between px-1 pb-1">
                    <span className="text-[10.5px] font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--text-muted)' }}>
                      Desafiar para jogar
                    </span>
                    <button
                      type="button"
                      aria-label="Fechar jogos"
                      onClick={() => setShowGamePicker(false)}
                      className="p-1 rounded-lg hover:bg-[var(--surface-hover)] cursor-pointer"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {CHAT_GAMES.map((g) => (
                    <button
                      key={g.kind}
                      type="button"
                      onClick={() => void handleSendGameChallenge(g.kind)}
                      className="w-full text-left p-2.5 rounded-xl border hover:border-[var(--tab-active)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer flex items-center gap-3"
                      style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}
                    >
                      <span className="text-xl leading-none">{g.emoji}</span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold">{g.name}</p>
                        <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                          {g.subtitle}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {showEmojiPicker && (
                <div
                  className="absolute bottom-full left-4 md:left-6 mb-2 p-2.5 max-w-[calc(100vw-2rem)] rounded-2xl flex flex-wrap gap-1.5 border z-20"
                  style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)', boxShadow: 'var(--shadow-card-hover)' }}
                >
                  {QUICK_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => handleEmojiSelect(emoji)}
                      className="w-8 h-8 flex items-center justify-center text-lg hover:bg-[var(--surface-hover)] rounded-xl transition-colors cursor-pointer"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}

              {editingMessage && (
                <div
                  className="mx-4 md:mx-5 mb-2 px-3.5 py-2.5 rounded-xl flex items-center justify-between border border-l-4"
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    borderColor: 'var(--border-input)',
                    borderLeftColor: 'var(--warning)',
                    boxShadow: 'var(--shadow-card)',
                  }}
                >
                  <div className="truncate flex-1 min-w-0 pr-3">
                    <span className="font-bold text-[11px] flex items-center gap-1.5" style={{ color: 'var(--warning)' }}>
                      <Pencil className="w-3 h-3" />
                      Editando mensagem
                    </span>
                    <span className="text-xs truncate block mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {editingMessage.text}
                    </span>
                  </div>
                  <button
                    type="button"
                    aria-label="Cancelar edição"
                    onClick={handleCancelEdit}
                    className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)] transition-colors cursor-pointer flex-shrink-0"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {replyingTo && (
                <div
                  className="mx-4 md:mx-5 mb-2 px-3.5 py-2.5 rounded-xl flex items-center justify-between border border-l-4"
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    borderColor: 'var(--border-input)',
                    borderLeftColor: 'var(--tab-active)',
                    boxShadow: 'var(--shadow-card)',
                  }}
                >
                  <div className="truncate flex-1 min-w-0 pr-3">
                    <span className="font-bold text-brand-panel text-[11px] block">{replyingTo.sender}</span>
                    <span className="text-xs truncate block mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {replyingTo.text}
                    </span>
                  </div>
                  <button
                    type="button"
                    aria-label="Fechar"
                    onClick={() => setReplyingTo(null)}
                    className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)] transition-colors cursor-pointer flex-shrink-0"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {activeChat.name === 'Geral' && !isCurrentAdmin ? (
              <div
                className="p-4 border-t flex items-center justify-center flex-shrink-0 pb-safe"
                style={{ borderColor: 'var(--border-input)', backgroundColor: 'var(--bg-input)' }}
              >
                <span className="text-xs font-semibold text-center" style={{ color: 'var(--text-muted)' }}>
                  Apenas Administradores podem enviar avisos neste grupo.
                </span>
              </div>
            ) : (
              <div
                className="chat-composer border-t flex flex-col flex-shrink-0 pb-safe"
                style={{ borderColor: 'var(--border-input)', backgroundColor: 'var(--bg-card)' }}
              >
                {typing.unavailable && (
                  <p className="chat-typing-unavailable" role="status">
                    Não foi possível conectar o indicador de digitação.{' '}
                    <button type="button" onClick={typing.retry}>
                      Tentar novamente
                    </button>
                  </p>
                )}
                <div className="chat-compose-toolbar">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="chat-urgent-toggle" data-active={urgentChannelId === activeChatId}>
                      <input
                        type="checkbox"
                        checked={urgentChannelId === activeChatId}
                        onChange={(e) => setUrgentChannelId(e.target.checked ? activeChatId : null)}
                      />
                      <BellRing size={13} />
                      Enviar como urgente
                    </label>
                    <button
                      type="button"
                      onClick={() => void handleSendBuzz()}
                      className="chat-buzz-btn"
                      data-cooling={Boolean(activeChatId && (buzzCooldownUntil[activeChatId] || 0) > presenceTime)}
                      title="Vibrar a tela e exibir aviso sobre as páginas (estilo Spark)"
                    >
                      <Zap size={13} />
                      Vibrar tela
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowEmojiPicker(false);
                        setShowGamePicker((prev) => !prev);
                      }}
                      className="chat-game-btn"
                      data-active={showGamePicker}
                      title="Convidar para Jogo da Velha, Ligue 4 ou Damas (estilo Spark)"
                    >
                      <Gamepad2 size={13} />
                      Jogar
                    </button>
                  </div>
                  <span>
                    {editingMessage
                      ? 'Enter para salvar edição · Esc para cancelar'
                      : urgentChannelId === activeChatId
                        ? 'Destaca a mensagem e chama a atenção dos participantes.'
                        : 'Enter envia · Shift+Enter quebra linha · Ctrl+V cola print'}
                  </span>
                </div>
                <form onSubmit={handleSendMessage} className="chat-compose-form flex flex-wrap items-end justify-between gap-2 sm:flex-nowrap">
                  <div
                    className="flex items-center rounded-xl p-1 border mb-0.5"
                    style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}
                  >
                    <button
                      aria-label="Emojis"
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        setShowEmojiPicker(!showEmojiPicker);
                      }}
                      className="p-2 rounded-lg hover:bg-[var(--bg-card)] transition-colors cursor-pointer"
                      style={{ color: 'var(--text-muted)' }}
                      title="Emojis"
                    >
                      <Smile className="w-[18px] h-[18px]" />
                    </button>
                    <button
                      aria-label="Anexar Imagem"
                      type="button"
                      onClick={() => imageInputRef.current?.click()}
                      className="p-2 rounded-lg hover:bg-[var(--bg-card)] transition-colors cursor-pointer"
                      style={{ color: 'var(--text-muted)' }}
                      title="Anexar Imagem"
                    >
                      <ImageIcon className="w-[18px] h-[18px]" />
                    </button>
                    <button
                      aria-label="Anexar Ficheiro"
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="p-2 rounded-lg hover:bg-[var(--bg-card)] transition-colors cursor-pointer"
                      style={{ color: 'var(--text-muted)' }}
                      title="Anexar Ficheiro"
                    >
                      <Paperclip className="w-[18px] h-[18px]" />
                    </button>
                  </div>

                  <textarea
                    ref={inputFieldRef}
                    value={inputText}
                    onChange={handleInputResize}
                    onPaste={handleComposerPaste}
                    onBlur={typing.stop}
                    onKeyDown={handleKeyDown}
                    rows={1}
                    placeholder={editingMessage ? 'Edite sua mensagem...' : 'Escreva a sua mensagem...'}
                    aria-label="Mensagem"
                    className="chat-compose-input order-first w-full basis-full sm:order-none sm:w-auto sm:basis-auto min-w-0 flex-1 px-4 py-3 rounded-xl border text-[14px] font-medium outline-none focus:border-brand-panel transition-colors resize-none overflow-y-auto custom-scrollbar leading-snug"
                    style={{ minHeight: '46px', backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
                  />

                  {inputText.trim() ? (
                    <button
                      aria-label="Enviar"
                      type="submit"
                      className="h-[46px] w-[46px] rounded-xl text-white cursor-pointer hover:brightness-105 transition-all active:scale-95 flex items-center justify-center flex-shrink-0 mb-0.5"
                      style={primaryActionStyle}
                    >
                      <Send className="w-[18px] h-[18px]" />
                    </button>
                  ) : (
                    <button
                      aria-label="Agendar reunião"
                      type="button"
                      onClick={() => setIsEventModalOpen(true)}
                      className="h-[46px] w-[46px] rounded-xl border hover:bg-[var(--surface-hover)] transition-colors cursor-pointer flex items-center justify-center flex-shrink-0 mb-0.5"
                      style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-muted)' }}
                      title="Agendar reunião"
                    >
                      <Calendar className="w-[18px] h-[18px]" />
                    </button>
                  )}
                </form>
              </div>
            )}
          </div>
        ) : (
          <div className="hidden lg:flex lg:flex-1 flex-col items-center justify-center h-full p-8 text-center gap-4" style={{ backgroundColor: 'var(--bg-page)' }}>
            <div className="chat-brand-icon w-14 h-14 rounded-2xl">
              <MessageSquare className="w-7 h-7" />
            </div>
            <div className="max-w-xs">
              <h3 className="text-base font-bold tracking-tight">Selecione ou inicie uma conversa</h3>
              <p className="text-xs mt-1.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                Escolha um canal ou pesquise um colega na lista ao lado para conversar em tempo real.
              </p>
            </div>
          </div>
        )}

        {/* COLUNA 3: GAVETA DE INFORMAÇÕES V2 */}
        {isInfoDrawerOpen && activeChat && (
          <div
            className={`${isInfoDrawerOpen ? 'flex' : 'hidden'} xl:flex flex-col w-full xl:w-[328px] flex-shrink-0 h-full overflow-hidden animate-in slide-in-from-right duration-200 border-l`}
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}
          >
            <div className="px-5 py-4 border-b flex items-center justify-between flex-shrink-0" style={{ borderColor: 'var(--border-input)' }}>
              <div className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  aria-label="Voltar"
                  onClick={() => setIsInfoDrawerOpen(false)}
                  className="lg:hidden p-1.5 -ml-1.5 rounded-xl hover:bg-[var(--surface-hover)] cursor-pointer transition-colors"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="chat-accent-bar" aria-hidden="true" />
                  <h4 className="font-bold text-sm tracking-tight truncate">
                    {activeChat.isDirect ? 'Informação do Contato' : 'Detalhes do Grupo'}
                  </h4>
                </div>
              </div>
              <button
                type="button"
                aria-label="Fechar"
                onClick={() => setIsInfoDrawerOpen(false)}
                className="hidden xl:flex p-1.5 rounded-xl hover:bg-[var(--surface-hover)] cursor-pointer transition-colors"
                style={{ color: 'var(--text-muted)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-5 text-center border-b space-y-3.5 flex-shrink-0" style={{ borderColor: 'var(--border-input)', backgroundColor: 'var(--bg-page)' }}>
              {activeChat.name === 'Geral' ? (
                <div
                  className="relative w-20 h-20 mx-auto rounded-2xl flex items-center justify-center border"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--tab-active) 12%, var(--bg-card))',
                    color: 'var(--tab-active)',
                    borderColor: 'color-mix(in srgb, var(--tab-active) 24%, transparent)',
                  }}
                >
                  <Megaphone className="w-9 h-9" />
                </div>
              ) : activeChat.foto_url ? (
                <img
                  src={activeChat.foto_url}
                  alt=""
                  className="w-20 h-20 mx-auto rounded-2xl object-cover border"
                  style={{ borderColor: 'var(--border-input)' }}
                />
              ) : directPeer?.avatar_url ? (
                <img
                  src={directPeer.avatar_url}
                  alt=""
                  className="w-20 h-20 mx-auto rounded-2xl object-cover border"
                  style={{ borderColor: 'var(--border-input)' }}
                />
              ) : (
                <div
                  className="relative w-20 h-20 mx-auto rounded-2xl text-white font-bold flex items-center justify-center text-2xl"
                  style={primaryActionStyle}
                >
                  {getInitials(directPeer ? directPeer.nome : activeChat.name)}
                </div>
              )}

              <div>
                <h3 className="font-bold text-[17px] tracking-tight leading-snug">
                  {directPeer ? directPeer.nome : activeChat.name}
                </h3>
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] mt-1" style={{ color: 'var(--text-muted)' }}>
                  {activeChat.isDirect
                    ? `${directPeer?.cargo?.toUpperCase() || 'COLABORADOR'}`
                    : `Grupo · ${activeChat.members.length} participantes`}
                </p>
              </div>

              {!activeChat.isDirect && isCurrentAdmin && activeChat.name !== 'Geral' && (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void recordActions.run('group-photo', () => handleSaveGroupPhoto(event));
                  }}
                  className="flex gap-2 pt-1"
                >
                  <input
                    type="url"
                    value={groupPhotoUrl}
                    onChange={(e) => setGroupPhotoUrl(e.target.value)}
                    placeholder="URL da foto..."
                    className="flex-1 min-w-0 px-3 py-2 rounded-xl border text-xs font-medium outline-none focus:border-brand-panel"
                    style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
                  />
                  <button
                    type="submit"
                    className="px-3.5 py-2 rounded-xl text-white text-xs font-semibold cursor-pointer hover:brightness-105 transition-all active:scale-95 flex-shrink-0"
                    style={primaryActionStyle}
                  >
                    Salvar
                  </button>
                </form>
              )}
            </div>

            <div
              className="flex border-b text-[11px] font-bold text-center uppercase tracking-[0.08em] overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none'] flex-shrink-0 px-2"
              style={{ borderColor: 'var(--border-input)', backgroundColor: 'var(--bg-card)' }}
            >
              {!activeChat.isDirect && (
                <button
                  type="button"
                  onClick={() => setInfoTab('members')}
                  className={`flex-1 px-3 py-3.5 border-b-2 transition-colors flex-shrink-0 cursor-pointer ${
                    infoTab === 'members'
                      ? 'border-[var(--tab-active)] text-[var(--tab-active)]'
                      : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]'
                  }`}
                >
                  Membros
                </button>
              )}
              <button
                type="button"
                onClick={() => setInfoTab('notes')}
                className={`flex-1 px-3 py-3.5 border-b-2 transition-colors flex-shrink-0 cursor-pointer ${
                  infoTab === 'notes'
                    ? 'border-[var(--tab-active)] text-[var(--tab-active)]'
                    : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]'
                }`}
              >
                Avisos
              </button>
              <button
                type="button"
                onClick={() => setInfoTab('media')}
                className={`flex-1 px-3 py-3.5 border-b-2 transition-colors flex-shrink-0 cursor-pointer ${
                  infoTab === 'media'
                    ? 'border-[var(--tab-active)] text-[var(--tab-active)]'
                    : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]'
                }`}
              >
                Mídia
              </button>
              <button
                type="button"
                onClick={() => setInfoTab('files')}
                className={`flex-1 px-3 py-3.5 border-b-2 transition-colors flex-shrink-0 cursor-pointer ${
                  infoTab === 'files'
                    ? 'border-[var(--tab-active)] text-[var(--tab-active)]'
                    : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]'
                }`}
              >
                Docs
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-3.5 custom-scrollbar" style={{ backgroundColor: 'var(--bg-page)' }}>
              {infoTab === 'members' && !activeChat.isDirect && (
                <div className="space-y-3">
                  {isCurrentAdmin && activeChat.name !== 'Geral' && (
                    <button
                      type="button"
                      onClick={() => setIsAddMemberModalOpen(true)}
                      className="w-full py-2.5 rounded-xl text-white font-semibold text-xs flex items-center justify-center gap-2 cursor-pointer hover:brightness-105 active:scale-[0.99] transition-all"
                      style={primaryActionStyle}
                    >
                      <UserPlus className="w-4 h-4" />
                      <span>Convidar</span>
                    </button>
                  )}
                  <div className="space-y-2">
                    {activeChat.members.map((member, idx) => {
                      const memberProfile = teamMembers.find((m) => m.user_id === member.user_id);
                      const memberPresence = getRealUserStatus(
                        member.user_id === currentUser.user_id
                          ? { status_presenca: userStatus, last_seen: new Date(presenceTime).toISOString() }
                          : memberProfile,
                        presenceTime
                      );
                      return (
                        <div
                          key={idx}
                          className="p-3 rounded-xl flex items-center justify-between gap-2 text-xs border"
                          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}
                        >
                          <div className="flex items-center gap-2.5 overflow-hidden min-w-0">
                            <div className="relative flex-shrink-0">
                              {memberProfile?.avatar_url ? (
                                <img
                                  src={memberProfile.avatar_url}
                                  alt=""
                                  className="w-9 h-9 rounded-xl object-cover border"
                                  style={{ borderColor: 'var(--border-input)' }}
                                />
                              ) : (
                                <div
                                  className="w-9 h-9 rounded-xl text-white font-semibold flex items-center justify-center text-xs"
                                  style={primaryActionStyle}
                                >
                                  {getInitials(member.name)}
                                </div>
                              )}
                              <span
                                className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 ${memberPresence.color}`}
                                style={{ borderColor: 'var(--bg-card)' }}
                                title={memberPresence.label}
                              />
                            </div>
                            <div className="truncate min-w-0">
                              <p className="font-semibold truncate text-[13px]">
                                {member.name} {member.user_id === currentUser.user_id && '(Você)'}
                              </p>
                              <p className="text-[11px] font-medium truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                {memberPresence.label} · {member.role} {member.isAdmin ? '· Admin' : ''}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {isCurrentAdmin && member.user_id !== currentUser.user_id && (
                              <button
                                type="button"
                                onClick={() => toggleAdminMember(member.user_id)}
                                className="text-[11px] font-semibold hover:underline cursor-pointer px-1.5 py-1 rounded-lg hover:bg-[var(--surface-hover)]"
                                style={{ color: 'var(--tab-active)' }}
                              >
                                {member.isAdmin ? 'Revogar Admin' : 'Dar Admin'}
                              </button>
                            )}
                            {isCurrentAdmin && member.user_id !== currentUser.user_id && activeChat.name !== 'Geral' && (
                              <button
                                type="button"
                                aria-label="Remover"
                                onClick={() => handleRemoveMemberFromGroup(member.user_id, member.name)}
                                className="p-1.5 rounded-lg text-[var(--error-text)] hover:bg-red-500/10 transition-colors cursor-pointer"
                                title="Remover"
                              >
                                <Trash2 className="w-4 h-4" />
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
                <div className="space-y-3.5">
                  <form onSubmit={handleAddNote} className="space-y-2.5">
                    <textarea
                      rows={3}
                      value={newNoteText}
                      onChange={(e) => setNewNoteText(e.target.value)}
                      placeholder="Fixar aviso permanente neste chat..."
                      className="w-full p-3.5 rounded-xl border text-sm font-medium outline-none resize-none focus:border-brand-panel transition-colors"
                      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
                    />
                    <button
                      type="submit"
                      className="w-full py-2.5 rounded-xl text-white font-semibold text-xs cursor-pointer hover:brightness-105 active:scale-[0.99] transition-all"
                      style={primaryActionStyle}
                    >
                      + Afixar Aviso
                    </button>
                  </form>
                  <div className="space-y-2.5 pt-1">
                    {chatNotes.map((note) => (
                      <div
                        key={note.id}
                        className="p-3.5 rounded-xl border text-sm space-y-2"
                        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}
                      >
                        <div
                          className="flex justify-between font-bold text-[10.5px] uppercase tracking-wider border-b pb-2"
                          style={{ borderColor: 'var(--border-input)', color: 'var(--text-muted)' }}
                        >
                          <span>{note.autor_nome}</span>
                          <span>{new Date(note.created_at).toLocaleDateString('pt-BR')}</span>
                        </div>
                        <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{note.conteudo}</p>
                      </div>
                    ))}
                    {chatNotes.length === 0 && (
                      <p className="text-center font-medium text-xs py-6" style={{ color: 'var(--text-muted)' }}>
                        Sem notas afixadas.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {infoTab === 'media' && (
                <div className="grid grid-cols-2 gap-2.5">
                  {activeMessages
                    .filter((m) => m.type === 'image' && m.mediaUrl && !m.deleted)
                    .map((m) => (
                      <a
                        key={m.id}
                        href={m.mediaUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-xl overflow-hidden border aspect-square hover:opacity-95 transition-opacity cursor-pointer block"
                        style={{ borderColor: 'var(--border-input)' }}
                      >
                        <img src={m.mediaUrl} alt="Mídia" className="w-full h-full object-cover" />
                      </a>
                    ))}
                  {activeMessages.filter((m) => m.type === 'image' && m.mediaUrl && !m.deleted).length === 0 && (
                    <p className="col-span-2 text-center font-medium text-xs py-6" style={{ color: 'var(--text-muted)' }}>
                      Sem ficheiros de média partilhados.
                    </p>
                  )}
                </div>
              )}

              {infoTab === 'files' && (
                <div className="space-y-2.5">
                  {activeMessages
                    .filter((m) => m.type === 'file' && m.mediaUrl && !m.deleted)
                    .map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center gap-3 p-3 rounded-xl border"
                        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}
                      >
                        <div className="chat-brand-icon w-9 h-9 rounded-xl flex-shrink-0">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div className="overflow-hidden flex-1 min-w-0">
                          <a
                            onClick={(event) => {
                              void openAttachment(event, m);
                            }}
                            href={m.mediaUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[13px] font-semibold truncate hover:underline block cursor-pointer"
                          >
                            {m.fileName}
                          </a>
                          <p className="text-[11px] font-medium mt-0.5" style={{ color: 'var(--text-muted)' }}>
                            {m.fileSize} · {m.dateLabel}
                          </p>
                        </div>
                        <a
                          onClick={(event) => {
                            void openAttachment(event, m);
                          }}
                          href={m.mediaUrl}
                          download={m.fileName}
                          className="p-2 rounded-lg hover:bg-[var(--surface-hover)] transition-colors cursor-pointer flex-shrink-0"
                          style={{ color: 'var(--text-muted)' }}
                          title="Baixar Arquivo"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                      </div>
                    ))}
                  {activeMessages.filter((m) => m.type === 'file' && m.mediaUrl && !m.deleted).length === 0 && (
                    <p className="text-center font-medium text-xs py-6" style={{ color: 'var(--text-muted)' }}>
                      Sem documentos partilhados.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="p-4 border-t flex-shrink-0" style={{ borderColor: 'var(--border-input)', backgroundColor: 'var(--bg-card)' }}>
              <button
                type="button"
                onClick={() => handleCloseChat(activeChat.id)}
                className="w-full py-2.5 rounded-xl border border-red-500/20 bg-red-500/10 text-[var(--error-text)] hover:bg-red-500/15 font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Excluir Conversa</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODAIS Z-[999] */}
      {isGroupModalOpen && (
        <ModalShell
          open
          description={<span className="text-[11px] font-bold uppercase tracking-[0.12em] text-brand-panel">Comunicação</span>}
          title="Criar Novo Grupo"
          onClose={() => setIsGroupModalOpen(false)}
          busy={dialogAction.pending}
          footer={
            <div className="flex justify-end gap-2.5 pt-4 border-t" style={{ borderColor: 'var(--border-input)' }}>
              <button
                form="modal-form-1"
                type="button"
                onClick={() => setIsGroupModalOpen(false)}
                className="px-5 py-2.5 rounded-xl border text-sm font-semibold cursor-pointer hover:bg-[var(--surface-hover)] transition-colors"
                style={{ borderColor: 'var(--border-input)' }}
              >
                Cancelar
              </button>
              <button
                form="modal-form-1"
                type="submit"
                className="px-6 py-2.5 rounded-xl text-white text-sm font-semibold cursor-pointer hover:brightness-105 active:scale-[0.99] transition-all"
                style={primaryActionStyle}
              >
                Criar Grupo
              </button>
            </div>
          }
        >
          <form
            id="modal-form-1"
            onSubmit={(event) => {
              event.preventDefault();
              void dialogAction.run(() => handleCreateGroup(event));
            }}
            className="p-6 md:p-7 space-y-5"
          >
            <div>
              <label htmlFor="field-1" className="text-[11px] font-bold uppercase tracking-[0.1em] block mb-2" style={{ color: 'var(--text-muted)' }}>
                Nome do Grupo
              </label>
              <input
                id="field-1"
                type="text"
                required
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Ex: Equipe de TI"
                className="w-full px-4 py-3 rounded-xl border text-sm font-medium outline-none focus:border-brand-panel transition-colors"
                style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
              />
            </div>
            <div>
              <label htmlFor="field-2" className="text-[11px] font-bold uppercase tracking-[0.1em] block mb-2" style={{ color: 'var(--text-muted)' }}>
                Selecione os Participantes
              </label>
              <div
                className="max-h-56 overflow-y-auto space-y-1.5 p-2.5 rounded-xl border custom-scrollbar"
                style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}
              >
                {teamMembers
                  .filter((m) => m.user_id !== currentUser?.user_id)
                  .map((member, index) => (
                    <label
                      key={member.user_id}
                      className="flex items-center justify-between p-2.5 rounded-lg cursor-pointer hover:bg-[var(--bg-card)] transition-colors border border-transparent hover:border-[var(--border-input)]"
                    >
                      <span className="font-medium text-sm">{member.nome}</span>
                      <input
                        id={index === 0 ? 'field-2' : undefined}
                        type="checkbox"
                        checked={selectedMembersToAdd.includes(member.user_id)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedMembersToAdd((prev) => [...prev, member.user_id]);
                          else setSelectedMembersToAdd((prev) => prev.filter((id) => id !== member.user_id));
                        }}
                        className="w-4 h-4 rounded accent-[var(--btn-primary)] cursor-pointer"
                      />
                    </label>
                  ))}
              </div>
            </div>
          </form>
        </ModalShell>
      )}

      {isAddMemberModalOpen && (
        <ModalShell
          open
          description={<span className="text-[11px] font-bold uppercase tracking-[0.12em] text-brand-panel">Gestão</span>}
          title="Convidar Colega"
          onClose={() => setIsAddMemberModalOpen(false)}
          busy={dialogAction.pending}
          footer={
            <div className="flex justify-end gap-2.5 pt-4 border-t" style={{ borderColor: 'var(--border-input)' }}>
              <button
                form="modal-form-2"
                type="button"
                onClick={() => setIsAddMemberModalOpen(false)}
                className="px-5 py-2.5 rounded-xl border text-sm font-semibold cursor-pointer hover:bg-[var(--surface-hover)] transition-colors"
                style={{ borderColor: 'var(--border-input)' }}
              >
                Cancelar
              </button>
              <button
                form="modal-form-2"
                type="submit"
                className="px-6 py-2.5 rounded-xl text-white text-sm font-semibold cursor-pointer hover:brightness-105 active:scale-[0.99] transition-all"
                style={primaryActionStyle}
              >
                Adicionar
              </button>
            </div>
          }
        >
          <form
            id="modal-form-2"
            onSubmit={(event) => {
              event.preventDefault();
              void dialogAction.run(() => handleAddMemberToGroup(event));
            }}
            className="p-6 md:p-7 space-y-5"
          >
            <div>
              <label htmlFor="field-3" className="text-[11px] font-bold uppercase tracking-[0.1em] block mb-2" style={{ color: 'var(--text-muted)' }}>
                Escolher Colaborador
              </label>
              <select
                id="field-3"
                value={memberToAddId}
                onChange={(e) => setMemberToAddId(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border text-sm font-medium outline-none cursor-pointer focus:border-brand-panel transition-colors"
                style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
              >
                <option value="">Selecione da lista...</option>
                {teamMembers
                  .filter((m) => !activeChat?.members.some((am) => am.user_id === m.user_id))
                  .map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.nome} ({m.setor})
                    </option>
                  ))}
              </select>
            </div>
          </form>
        </ModalShell>
      )}

      {isEventModalOpen && (
        <ModalShell
          open
          description={<span className="text-[11px] font-bold uppercase tracking-[0.12em] text-brand-panel">Agendamento</span>}
          title="Reunião no Chat"
          onClose={() => setIsEventModalOpen(false)}
          busy={dialogAction.pending}
          footer={
            <div className="flex justify-end gap-2.5 pt-4 border-t" style={{ borderColor: 'var(--border-input)' }}>
              <button
                form="modal-form-3"
                type="button"
                onClick={() => setIsEventModalOpen(false)}
                className="px-5 py-2.5 rounded-xl border text-sm font-semibold cursor-pointer hover:bg-[var(--surface-hover)] transition-colors"
                style={{ borderColor: 'var(--border-input)' }}
              >
                Cancelar
              </button>
              <button
                form="modal-form-3"
                type="submit"
                className="px-6 py-2.5 rounded-xl text-white text-sm font-semibold cursor-pointer hover:brightness-105 active:scale-[0.99] transition-all"
                style={primaryActionStyle}
              >
                Enviar Convite
              </button>
            </div>
          }
        >
          <form
            id="modal-form-3"
            onSubmit={(event) => {
              event.preventDefault();
              void dialogAction.run(() => handleCreateChatEvent(event));
            }}
            className="p-6 md:p-7 space-y-5"
          >
            <div>
              <label htmlFor="field-4" className="text-[11px] font-bold uppercase tracking-[0.1em] block mb-2" style={{ color: 'var(--text-muted)' }}>
                Título do Convite
              </label>
              <input
                id="field-4"
                type="text"
                required
                value={eventTitle}
                onChange={(e) => setEventTitle(e.target.value)}
                placeholder="Ex: Alinhamento Semanal..."
                className="w-full px-4 py-3 rounded-xl border text-sm font-medium outline-none focus:border-brand-panel transition-colors"
                style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
              />
            </div>
            <div className="grid grid-cols-2 gap-3.5">
              <div>
                <label htmlFor="field-5" className="text-[11px] font-bold uppercase tracking-[0.1em] block mb-2" style={{ color: 'var(--text-muted)' }}>
                  Data
                </label>
                <input
                  id="field-5"
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className="w-full px-3.5 py-3 rounded-xl border text-sm font-medium outline-none focus:border-brand-panel transition-colors cursor-pointer"
                  style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
                />
              </div>
              <div>
                <label htmlFor="field-6" className="text-[11px] font-bold uppercase tracking-[0.1em] block mb-2" style={{ color: 'var(--text-muted)' }}>
                  Horário
                </label>
                <input
                  id="field-6"
                  type="time"
                  value={eventTime}
                  onChange={(e) => setEventTime(e.target.value)}
                  className="w-full px-3.5 py-3 rounded-xl border text-sm font-medium outline-none focus:border-brand-panel transition-colors cursor-pointer"
                  style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
                />
              </div>
            </div>
            <div>
              <label htmlFor="field-7" className="text-[11px] font-bold uppercase tracking-[0.1em] block mb-2" style={{ color: 'var(--text-muted)' }}>
                Local ou Link (Opcional)
              </label>
              <input
                id="field-7"
                type="text"
                value={eventLocation}
                onChange={(e) => setEventLocation(e.target.value)}
                placeholder="Ex: Sala 2 ou Google Meet"
                className="w-full px-4 py-3 rounded-xl border text-sm font-medium outline-none focus:border-brand-panel transition-colors"
                style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
              />
            </div>
          </form>
        </ModalShell>
      )}

      {/* MODAL DE CONFIRMAÇÃO GENÉRICO */}
      {confirmModal.isOpen && (
        <ModalShell
          open
          title={confirmModal.title}
          onClose={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
          destructive={confirmModal.isDestructive}
          busy={dialogAction.pending}
          footer={
            <div className="flex flex-col sm:flex-row justify-end gap-2.5 px-6 md:px-7 py-4 border-t" style={{ borderColor: 'var(--border-input)' }}>
              <button
                type="button"
                onClick={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl border text-sm font-semibold cursor-pointer hover:bg-[var(--surface-hover)] transition-colors"
                style={{ borderColor: 'var(--border-input)' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => dialogAction.run(confirmModal.onConfirm)}
                className={`w-full sm:w-auto px-6 py-2.5 rounded-xl text-white text-sm font-semibold cursor-pointer transition-all active:scale-[0.99] ${
                  confirmModal.isDestructive ? 'bg-red-500 hover:bg-red-600' : 'hover:brightness-105'
                }`}
                style={!confirmModal.isDestructive ? primaryActionStyle : undefined}
              >
                Confirmar
              </button>
            </div>
          }
        >
          <div className="p-6 md:p-7">
            <p className="text-sm font-medium leading-relaxed text-center" style={{ color: 'var(--text-muted)' }}>
              {confirmModal.message}
            </p>
          </div>
        </ModalShell>
      )}

      {/* TABULEIRO DE JOGO AO VIVO (ESTILO SPARK) */}
      <ChatGameModal
        open={Boolean(activeGameMessageId)}
        game={(activeMessages.find((m) => m.id === activeGameMessageId)?.metadata?.game as ChatGameState) || null}
        currentUserId={currentUser.user_id}
        busy={recordActions.pending > 0}
        onClose={() => setActiveGameMessageId(null)}
        onUpdateGame={async (next) => {
          if (activeGameMessageId) await handleUpdateGame(activeGameMessageId, next);
        }}
      />

      {/* LIGHTBOX DE IMAGEM ESTILO WHATSAPP / TELEGRAM */}
      {lightboxImage && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Visualização da imagem"
          onClick={() => setLightboxImage(null)}
          className="fixed inset-0 z-[1200] bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-4 sm:p-8"
        >
          <div className="flex items-center justify-end gap-2 w-full max-w-4xl mb-3" onClick={(e) => e.stopPropagation()}>
            <a
              href={lightboxImage.url}
              download={lightboxImage.fileName || 'imagem.png'}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Download className="w-4 h-4" />
              Baixar
            </a>
            <button
              type="button"
              aria-label="Fechar visualização"
              onClick={() => setLightboxImage(null)}
              className="p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <img
            src={lightboxImage.url}
            alt="Prévia ampliada"
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-[82vh] rounded-2xl object-contain shadow-2xl border border-white/15"
          />
        </div>
      )}
    </div>
  );
}
