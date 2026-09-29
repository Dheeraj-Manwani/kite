import log from 'electron-log/renderer';
log.transports.console.level = false;
log.transports.ipc = Object.assign((message: import('electron-log').LogMessage) => {
  const event = message.data[0];
  if (event === 'renderer:ready' || event === 'renderer:error') window.kite.logEvent(event);
}, { level: 'info' as const, transforms: [] });
window.addEventListener('error', () => log.info('renderer:error'));
window.addEventListener('unhandledrejection', () => log.info('renderer:error'));
log.info('renderer:ready');
