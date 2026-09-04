import { GameProvider, useGame } from './net/store.js';
import { JoinScreen } from './screens/JoinScreen.js';
import { LobbyScreen } from './screens/LobbyScreen.js';
import { PlacementScreen } from './screens/PlacementScreen.js';
import { BattleScreen } from './screens/BattleScreen.js';
import { AdminScreen } from './screens/AdminScreen.js';
import { TopBar } from './components/TopBar.js';
import { Toasts } from './components/Toasts.js';
import { InviteCard } from './components/InviteCard.js';

/**
 * Two entry points share one bundle:
 *   /        -> the game client
 *   /admin   -> the server dashboard (never joins the lobby)
 */
export default function App() {
  const isAdmin = window.location.pathname.startsWith('/admin');
  if (isAdmin) return <AdminScreen />;
  return (
    <GameProvider>
      <Game />
    </GameProvider>
  );
}

function Game() {
  const { session, room } = useGame();

  if (!session) {
    return (<><JoinScreen /><Toasts /></>);
  }

  return (
    <div className="app">
      <TopBar
        right={
          room ? <span className="pill">{room.role === 'spectator' ? 'spectating' : 'in match'}</span> : null
        }
      />
      <main className="page anim-in" key={room ? room.phase : 'lobby'}>
        {!room && <LobbyScreen />}
        {room && room.phase === 'placing' && room.role === 'player' && <PlacementScreen room={room} />}
        {room && (room.phase !== 'placing' || room.role === 'spectator') && <BattleScreen room={room} />}
      </main>
      <InviteCard />
      <Toasts />
    </div>
  );
}
