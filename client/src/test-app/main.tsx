import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { WebsocketProvider } from '..';


ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WebsocketProvider>
      <App />
    </WebsocketProvider>
  </React.StrictMode>
);
