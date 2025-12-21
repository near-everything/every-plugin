import {
  Suspense,
  lazy,
  type FC,
  useState,
  type CSSProperties,
  useCallback,
} from 'react';
import { loadRemote } from '@module-federation/enhanced/runtime';
import { ErrorBoundary, Loading } from './ui';
import { getRuntimeConfig } from './federation';

const RemoteApp = lazy(async () => {
  const config = getRuntimeConfig();
  const module = await loadRemote<{ default: FC }>(`${config.ui.name}/App`);
  if (!module) throw new Error(`Failed to load ${config.ui.name}/App`);
  return module;
});

export const Main: FC = () => {
  const [retryKey, setRetryKey] = useState(0);

  const handleRetry = useCallback(() => {
    console.log('[Host] Retrying remote app load...');
    setRetryKey((prev) => prev + 1);
  }, []);

  const containerStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    width: '100vw',
    overflow: 'hidden',
  };

  const contentStyle: CSSProperties = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'auto',
  };

  return (
    <div style={containerStyle}>
      <div style={contentStyle}>
        <ErrorBoundary
          onError={(error) => {
            console.error('[Host] Failed to load remote app:', error.message);
          }}
          onRetry={handleRetry}
        >
          <Suspense key={retryKey} fallback={<Loading />}>
            <RemoteApp />
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  );
};

export default Main;
