import {createRoot} from 'react-dom/client';
import App from './app/App';
import './app/App.css';

const element = document.getElementById('root');
const root = createRoot(element);

root.render(
  <App/>
);