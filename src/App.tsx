import { Navigate, Route, Routes } from 'react-router-dom';
import Home from './pages/Home';
import Play from './pages/Play';
import Admin from './pages/Admin';
import QuizEditor from './pages/QuizEditor';
import Host from './pages/Host';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/join/:code" element={<Home />} />
      <Route path="/play/:code" element={<Play />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="/admin/quiz/:quizId" element={<QuizEditor />} />
      <Route path="/host/:code" element={<Host />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
