import { useEffect } from 'react';
import { useWebsocket } from '..';


const App = () => {
  const { websocket, setupWebsocket } = useWebsocket();


  useEffect(() => {
    setupWebsocket('ws://localhost:3000/');
  }, []);

  const test = async () => {
    if (!websocket) return console.log('no websocket');
    const res = await websocket?.sendEvent('test', 25, true);

    console.log(res);
  };

  return (
    <div>
      <h1>Hello World</h1>

      <button onClick={() => test()}>Send Test</button>
    </div>
  );
};

export default App;
