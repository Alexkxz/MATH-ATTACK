import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArcadeHeader } from './components/ArcadeHeader';
import { ArcadeScoreboard } from './components/ArcadeScoreboard';
import { ArcadeTabNav, TabKey } from './components/ArcadeTabNav';
import { StudentsTab } from './components/StudentsTab';
import { LiveGameTab } from './components/LiveGameTab';
import { TestsCenterTab } from './components/TestsCenterTab';
import { TransactionsTab } from './components/TransactionsTab';
import { ConnectionsTab } from './components/ConnectionsTab';
import { SettingsTab } from './components/SettingsTab';
import { ProjectorView } from './components/ProjectorView';
import { ArcadeLoginOverlay } from './components/ArcadeLoginOverlay';
import { AddStudentModal } from './components/Modals/AddStudentModal';
import { BulkAureosModal } from './components/Modals/BulkAureosModal';
import { AnnouncementModal } from './components/Modals/AnnouncementModal';
import { AureosResetModal } from './components/Modals/AureosResetModal';
import { StudentHistoryModal } from './components/Modals/StudentHistoryModal';
import { EditValueModal, EditValueType } from './components/Modals/EditValueModal';
import { ClientConnection, ConsoleLogEntry, GameSession, MathTest, Player, AureosTransaction } from './types/maestro';
import { adminRequest, mapPlayer } from './utils/api';
import { arcadeAudio } from './utils/arcadeAudio';

const activeSession = (s: any): GameSession => ({
  ...s, id: String(s.id), playerId: String(s.id), totalQ: Number(s.totalQ || 0), qIndex: Number(s.qIndex || 0),
  correct: Number(s.correct || 0), wrong: Number(s.wrong || 0), paused: !!s.paused,
  status: s.status === 'finished' ? 'finished' : s.paused ? 'paused' : 'playing',
});

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(sessionStorage.getItem('maestroAuth') === '1' && !!sessionStorage.getItem('maestroPwd'));
  const [crtActive, setCrtActive] = useState(true);
  const [audioActive, setAudioActive] = useState(true);
  const [projectorMode, setProjectorMode] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('alumnos');
  const [students, setStudents] = useState<Player[]>([]);
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [operationStats, setOperationStats] = useState<Record<string,{pct:number|null;games:number}>>({});
  const [transactions, setTransactions] = useState<AureosTransaction[]>([]);
  const [connections, setConnections] = useState<ClientConnection[]>([]);
  const [logs, setLogs] = useState<ConsoleLogEntry[]>([]);
  const [historyStudent, setHistoryStudent] = useState<Player | null>(null);
  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);
  const [isBulkAureosOpen, setIsBulkAureosOpen] = useState(false);
  const [isAnnounceOpen, setIsAnnounceOpen] = useState(false);
  const [isResetTotalOpen, setIsResetTotalOpen] = useState(false);
  const [toast, setToast] = useState<{text:string;type:'success'|'warn'|'info'}|null>(null);
  const [error, setError] = useState('');
  const [online, setOnline] = useState(false);
  const [editModal, setEditModal] = useState<{isOpen:boolean;type:EditValueType;title:string;hint:string;initialValue:string|number;onSave:(value:string|number)=>void}>({isOpen:false,type:'aureos',title:'',hint:'',initialValue:0,onSave:()=>{}});

  const notify = (text:string, type:'success'|'warn'|'info'='success') => { setToast({text,type}); window.setTimeout(()=>setToast(null),3500); };
  const loadStudents = useCallback(async () => {
    const data = await adminRequest<any[]>('/api/players');
    const players = await Promise.all(data.map(async raw => {
      const player = mapPlayer(raw);
      try { const pin = await adminRequest<{pin:string}>(`/api/players/get-pin?id=${encodeURIComponent(player.id)}`); player.pin = pin.pin || ''; } catch {}
      return player;
    }));
    setStudents(players);
  }, []);
  const loadEconomy = useCallback(async () => {
    const [logData, connectionData] = await Promise.all([
      adminRequest<any[]>('/api/players/aureos-log'),
      adminRequest<{connections:any[];log:any[]}>('/api/connections',{method:'POST',body:JSON.stringify({})}),
    ]);
    setTransactions(logData.map((row:any)=>({id:String(row.id||row.txId||`${row.ts}-${row.name}`),ts:Number(row.ts||Date.now()),name:row.name||'',grade:row.grade||'',reason:row.reason||row.type||'Movimiento',delta:Number(row.delta||0),balance:Number(row.balance||0)})));
    setConnections((connectionData.connections||[]).map((c:any)=>({...c,id:String(c.playerId||c.id),type:c.type==='maestro'?'maestro':'player'})));
    setLogs((connectionData.log||[]).map((l:any,i:number)=>({id:String(l.id||i),ts:Number(l.ts||Date.now()),evType:l.evType||l.type||'connect',msg:l.msg||l.message||l.name||'Actividad de conexión'})));
  }, []);
  const refreshAll = useCallback(async()=>{
    try { await Promise.all([loadStudents(),loadEconomy()]); setError(''); }
    catch(e:any) { setError(e.message||'No se pudieron cargar los datos del servidor.'); }
  },[loadStudents,loadEconomy]);

  useEffect(()=>{ if(!isAuthenticated)return; void refreshAll(); const id=window.setInterval(()=>void refreshAll(),12000); return ()=>window.clearInterval(id); },[isAuthenticated,refreshAll]);
  useEffect(()=>{
    if(!isAuthenticated)return;
    const protocol=location.protocol==='https:'?'wss:':'ws:';
    const socket=new WebSocket(`${protocol}//${location.host}/ws-maestro`);
    socket.onopen=()=>setOnline(true); socket.onclose=()=>setOnline(false); socket.onerror=()=>setOnline(false);
    socket.onmessage=event=>{ try { const message=JSON.parse(event.data); if(message.type==='panel_state'){setSessions((message.sessions||[]).map(activeSession));setOperationStats(message.opStats||{});} if(message.type==='students_updated')void loadStudents(); } catch {} };
    return ()=>socket.close();
  },[isAuthenticated,loadStudents]);

  const auth = async (username:string,password:string) => {
    try {
      const response=await fetch('/api/maestro/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});
      const result=await response.json(); if(!response.ok||!result.ok) throw new Error('Usuario o contraseña incorrectos');
      sessionStorage.setItem('maestroPwd',password); sessionStorage.setItem('maestroAuth','1'); setIsAuthenticated(true); notify('Sesión de maestro iniciada'); return true;
    } catch(e:any) { setError(e.message||'No se pudo iniciar sesión'); return false; }
  };
  const run = async (operation:()=>Promise<unknown>, success:string) => { try { await operation(); await refreshAll(); notify(success); } catch(e:any) { notify(e.message||'La operación falló','warn'); } };

  const addStudent=(name:string,grade:string,pin:string)=>void run(async()=>{
    await adminRequest('/api/players/register',{method:'POST',body:JSON.stringify({name,grade,pin})});
  },`Alumno ${name} registrado`);
  const deleteStudent=(id:string,name:string)=>{ if(!window.confirm(`¿Eliminar a ${name} y su progreso?`))return; void run(()=>adminRequest(`/api/players/${encodeURIComponent(id)}`,{method:'DELETE',body:JSON.stringify({password:sessionStorage.getItem('maestroPwd')})}),`${name} eliminado`); };
  const updateStudent=(updated:Player)=>{
    const old=students.find(s=>s.id===updated.id); if(!old)return;
    const jobs:Promise<unknown>[]=[];
    if(old.aureos!==updated.aureos)jobs.push(adminRequest('/api/players/admin-aureos',{method:'POST',body:JSON.stringify({id:updated.id,aureos:updated.aureos})}));
    if(old.grade!==updated.grade)jobs.push(adminRequest('/api/players/admin-grade',{method:'POST',body:JSON.stringify({id:updated.id,grade:updated.grade})}));
    if(old.pin!==updated.pin)jobs.push(adminRequest('/api/players/admin-pin',{method:'POST',body:JSON.stringify({id:updated.id,pin:updated.pin})}));
    const ids=new Set([...Object.keys(old.inventory||{}),...Object.keys(updated.inventory||{})]);
    ids.forEach(powerId=>{const qty=Number(updated.inventory?.[powerId]||0);if(qty!==Number(old.inventory?.[powerId]||0))jobs.push(adminRequest('/api/players/admin-power',{method:'POST',body:JSON.stringify({id:updated.id,powerId,qty})}));});
    if(!jobs.length)return; void run(()=>Promise.all(jobs),`Perfil de ${updated.name} actualizado`);
  };
  const bulkAureos=(amount:number,grade:string)=>void run(()=>adminRequest('/api/players/bulk-aureos',{method:'POST',body:JSON.stringify({amount,grade})}),`Áureos entregados: +${amount}`);
  const commandAll=(action:'pause'|'resume'|'end')=>{if(action==='end'&&!window.confirm('¿Terminar todas las partidas activas?'))return;void run(()=>adminRequest('/api/cmd/all',{method:'POST',body:JSON.stringify({action})}),`Comando ${action} enviado`);};
  const commandPlayer=(sessionId:string,action:'pause'|'resume'|'end')=>void run(()=>adminRequest(`/api/cmd/${encodeURIComponent(sessionId)}`,{method:'POST',body:JSON.stringify({action,playerId:sessionId})}),`Comando ${action} enviado`);
  const sendAnnouncement=(message:string)=>{
    const socket=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/ws-maestro`);
    socket.onopen=()=>{socket.send(JSON.stringify({type:'maestro_announcement',text:message,password:sessionStorage.getItem('maestroPwd')}));socket.close();notify('Anuncio transmitido');};
    socket.onerror=()=>notify('No se pudo transmitir el anuncio','warn');
  };
  const resetAureos=()=>void run(()=>adminRequest('/api/players/aureos-reset',{method:'POST',body:JSON.stringify({})}),'Saldos restablecidos');
  const kickPlayer=(id:string,name:string)=>{
    const socket=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/ws-maestro`);
    socket.onopen=()=>{socket.send(JSON.stringify({type:'kick_player',playerId:id,password:sessionStorage.getItem('maestroPwd')}));socket.close();notify(`${name} desconectado`);};
    socket.onerror=()=>notify(`No se pudo desconectar a ${name}`,'warn');
  };
  const onlineStudentNames=useMemo(()=>connections.filter(c=>c.type==='player').map(c=>c.name.toLowerCase()),[connections]);

  return <div className={`min-h-screen bg-[#06040e] text-slate-100 ${crtActive?'crt-scanlines crt-vignette':''}`}>
    <div className="fixed inset-0 retro-grid-bg pointer-events-none opacity-40 z-0"/><div className="fixed top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#140b2b]/50 to-transparent pointer-events-none z-0"/>
    {!isAuthenticated&&<ArcadeLoginOverlay onSuccess={auth} studentsCount={students.length}/>}
    {projectorMode&&<ProjectorView sessions={sessions} onExit={()=>setProjectorMode(false)}/>}
    <div className="relative z-10 flex flex-col min-h-screen">
      <ArcadeHeader crtActive={crtActive} onToggleCrt={()=>setCrtActive(!crtActive)} audioActive={audioActive} onToggleAudio={()=>{const next=!audioActive;setAudioActive(next);arcadeAudio.enabled=next;}} projectorMode={projectorMode} onToggleProjector={()=>setProjectorMode(!projectorMode)} connected={online} ping={null}/>
      {toast&&<div className="fixed bottom-6 right-6 z-50 px-5 py-3 rounded-lg border-2 bg-[#090616] font-['Press_Start_2P'] text-[9px] border-cyan-400 text-cyan-300">{toast.text}</div>}
      {(error||!online)&&isAuthenticated&&<div className="relative z-20 mx-auto mt-2 max-w-7xl px-4 text-xs text-amber-300">{error||'Conectando con el servidor…'}</div>}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-4">
        <ArcadeScoreboard students={students} sessions={sessions} operationStats={operationStats} onQuickOpClick={()=>setActiveTab('pruebas')}/>
        <ArcadeTabNav activeTab={activeTab} onSelectTab={setActiveTab} studentsCount={students.length} playingCount={sessions.filter(s=>!s.paused&&s.status!=='finished').length} connectionsCount={connections.length}/>
        <div className="min-h-[450px]">
          {activeTab==='alumnos'&&<StudentsTab students={students} onlineStudentNames={onlineStudentNames} onAddStudentClick={()=>setIsAddStudentOpen(true)} onBulkAureosClick={()=>setIsBulkAureosOpen(true)} onOpenHistory={student=>void run(async()=>{const history=await adminRequest<any[]>(`/api/students/history?name=${encodeURIComponent(student.name)}`);setHistoryStudent({...student,history} as any);},'Historial cargado')} onDeleteStudent={deleteStudent} onOpenEditModal={(type,title,hint,initialValue,onSave)=>setEditModal({isOpen:true,type,title,hint,initialValue,onSave})} onUpdateStudent={updateStudent} onExportCsv={()=>window.location.assign('/api/players/export?pwd='+encodeURIComponent(sessionStorage.getItem('maestroPwd')||''))}/>}
          {activeTab==='sesiones'&&<LiveGameTab sessions={sessions} onCommandAll={commandAll} onCommandPlayer={commandPlayer} onOpenAnnounce={()=>setIsAnnounceOpen(true)} onOpenProjector={()=>setProjectorMode(true)}/>}
          {activeTab==='pruebas'&&<TestsCenterTab students={students}/>}
          {activeTab==='transacciones'&&<TransactionsTab transactions={transactions} students={students} onOpenBulkAureos={()=>setIsBulkAureosOpen(true)} onOpenResetTotal={()=>setIsResetTotalOpen(true)} onClearFilteredTransactions={(studentName,grade,date)=>{if(!window.confirm('¿Borrar permanentemente del historial las transacciones que coinciden con estos filtros?'))return;void run(()=>adminRequest('/api/players/aureos-log/clear',{method:'POST',body:JSON.stringify({name:studentName,grade,date})}),'Transacciones eliminadas');}}/>}
          {activeTab==='conexion'&&<ConnectionsTab connections={connections} logs={logs} onKickPlayer={kickPlayer} onClearLogs={()=>void refreshAll()}/>}
          {activeTab==='ajustes'&&<SettingsTab crtActive={crtActive} onToggleCrt={()=>setCrtActive(!crtActive)} audioActive={audioActive} onToggleAudio={()=>{const next=!audioActive;setAudioActive(next);arcadeAudio.enabled=next;}} onLogout={()=>{sessionStorage.removeItem('maestroAuth');sessionStorage.removeItem('maestroPwd');setIsAuthenticated(false);}} onCredentialsChanged={(password)=>{sessionStorage.setItem('maestroPwd',password);notify('Credenciales actualizadas');}}/>}
        </div>
      </main>
      <footer className="bg-[#05030c] border-t border-purple-500/20 py-3 px-4 text-center text-[8px] font-['Press_Start_2P'] text-slate-500 max-w-7xl mx-auto w-full">MATH ATTACK ARCADE · PANEL DEL MAESTRO</footer>
    </div>
    <AddStudentModal isOpen={isAddStudentOpen} onClose={()=>setIsAddStudentOpen(false)} onAdd={addStudent}/>
    <BulkAureosModal isOpen={isBulkAureosOpen} onClose={()=>setIsBulkAureosOpen(false)} onConfirm={bulkAureos}/>
    <AnnouncementModal isOpen={isAnnounceOpen} onClose={()=>setIsAnnounceOpen(false)} onSend={sendAnnouncement}/>
    <AureosResetModal isOpen={isResetTotalOpen} onClose={()=>setIsResetTotalOpen(false)} onConfirmReset={resetAureos}/>
    <StudentHistoryModal isOpen={!!historyStudent} student={historyStudent} onClose={()=>setHistoryStudent(null)}/>
    <EditValueModal isOpen={editModal.isOpen} type={editModal.type} title={editModal.title} hint={editModal.hint} initialValue={editModal.initialValue} onClose={()=>setEditModal(prev=>({...prev,isOpen:false}))} onSave={editModal.onSave}/>
  </div>;
}
