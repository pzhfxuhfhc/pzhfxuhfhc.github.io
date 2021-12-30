if ('serviceWorker' in navigator) {
  console.log('👍', 'navigator.serviceWorker is supported');
  navigator.serviceWorker.register('service-worker.js');
}
