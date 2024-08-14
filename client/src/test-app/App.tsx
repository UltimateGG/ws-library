import { useEffect } from 'react';
import { useWebsocket } from '..';

enum Event {
  HELLO = 'hello',
  TEST = 'test'
}

const App = () => {
  const { websocket, setupWebsocket } = useWebsocket();

  useEffect(() => {
    setupWebsocket('ws://localhost:3000/');
  }, []);

  useEffect(() => {
    const unsubscribe = websocket?.subscribe(Event.HELLO, async () => {
      console.log('Received Hello event');
      await new Promise(resolve => setTimeout(resolve, 1_000));

      return 'Hello, World!';
    });

    return unsubscribe;
  }, [websocket]);

  const test = async () => {
    if (!websocket) return console.log('no websocket');
    const res = await websocket?.sendEvent(Event.TEST, 25, true);

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
