import { useEffect, useState } from 'react';


const App = () => {
  const [ws, setWs] = useState<WebSocket | null>(null);

  
  useEffect(() => {
    if (ws) return;
    console.log('connecting...');
    const newWs = new WebSocket('ws://localhost:3000/');
    setWs(newWs);

    newWs.onopen = () => {
      console.log('connected');
      newWs.send('{"event": "test", "data": 43}');
    };

    newWs.onmessage = (event) => {
      console.log(event.data);
      const data = JSON.parse(event.data);
      if (data.event === 'ping') {
        newWs.send('{"event": "pong"}');
      }
    };

    newWs.onclose = () => {
      console.log('disconnected');
    };

    newWs.onerror = (err) => {
      console.error(err);
    };
  }, [ws]);

  return (
    <div>
      <h1>Hello Worldf</h1>    
    </div>
  );
};

export default App;
