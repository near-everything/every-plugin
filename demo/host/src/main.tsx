import {
  Suspense,
  lazy,
  type FC,
  useState,
  useEffect,
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

  useEffect(() => {
    const config = getRuntimeConfig();
    document.title = config.title;

    const handleTitleChange = (event: CustomEvent<{ title: string }>) => {
      const remoteTitle = event.detail?.title;
      const hostTitle = config.title;

      if (remoteTitle && hostTitle) {
        document.title = `${remoteTitle} | ${hostTitle}`;
      }
    };

    window.addEventListener(
      'near:title-change',
      handleTitleChange as EventListener
    );
    return () => {
      window.removeEventListener(
        'near:title-change',
        handleTitleChange as EventListener
      );
    };
  }, []);

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
