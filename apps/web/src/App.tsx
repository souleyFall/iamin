import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { CheckIn } from './screens/CheckIn';
import { Copy } from './screens/Copy';
import { Draw } from './screens/Draw';
import { GroupScreen } from './screens/GroupScreen';
import { Journal } from './screens/Journal';
import { Login } from './screens/Login';
import { Me } from './screens/Me';
import { NewTournament } from './screens/NewTournament';
import { Play } from './screens/Play';
import { Registrations } from './screens/Registrations';
import { TournamentLayout } from './screens/TournamentLayout';
import { Tournaments } from './screens/Tournaments';

export function App() {
  return (
    <Routes>
      <Route path="/connexion" element={<Login />} />
      <Route element={<Layout />}>
        <Route index element={<Tournaments />} />
        <Route path="nouveau" element={<NewTournament />} />
        <Route path="groupe" element={<GroupScreen />} />
        <Route path="moi" element={<Me />} />
        <Route path="tournois/:tournamentId" element={<TournamentLayout />}>
          <Route index element={<Navigate to="inscrits" replace />} />
          <Route path="inscrits" element={<Registrations />} />
          <Route path="pointage" element={<CheckIn />} />
          <Route path="tirage" element={<Draw />} />
          <Route path="jeu" element={<Play />} />
          <Route path="journal" element={<Journal />} />
          <Route path="copier" element={<Copy />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
