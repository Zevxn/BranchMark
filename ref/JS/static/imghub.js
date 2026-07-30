// content.js
window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'BANANA_INTERCEPT_DOWNLOAD') {
        // console.log('[Banana Content] 收到拦截数据，转发给后台');
        
        chrome.runtime.sendMessage({
            type: 'PROCESS_AND_DOWNLOAD',
            base64: event.data.base64,
            filename: event.data.filename
        });
    }
});