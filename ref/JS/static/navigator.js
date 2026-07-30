// navigator.js
// 监听来自 BookMarks.js (隔离世界) 的消息

window.addEventListener('message', (event) => {
    // 建议加一个特有的标识，防止冲突
    if (event.data && event.data.action === 'SPA_JUMP') {
        const url = event.data.url;
        history.pushState({}, "", url);
        window.dispatchEvent(new PopStateEvent('popstate'));
    }else if (event.data && event.data.action === 'ClICK_JUMP') {
        const targetUrl = event.data.url;

        // 创建一个临时的 a 标签
        const a = document.createElement('a');
        a.href = targetUrl;
        a.style.display = 'none';
        document.body.appendChild(a);

        // 模拟原生点击
        // 注意：简单的 a.click() 在某些 React 版本可能被拦截
        // 使用 MouseEvent 模拟更真实
        const clickEvent = new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true,
            ctrlKey: false
        });
        a.dispatchEvent(clickEvent);

        // 清理
        a.remove();
    }
});



// // navigator.js
// window.addEventListener('message', (event) => {
//     if (event.data && event.data.action === 'SPA_JUMP') {
//         const url = event.data.url;

//         // 尝试检测 Vue 2/3
//         const app = document.querySelector('#app') || document.querySelector('#app-mount');
//         // 获取 Vue 实例
//         const vueInstance = app?.__vue__ || app?._vnode?.component?.proxy;

//         if (vueInstance && vueInstance.$router) {
//             // 直接调用 Vue Router 的 push
//             vueInstance.$router.push(url);
//             console.log('Detected Vue Router, navigating...');
//             return; 
//         }

//         // 如果不是 Vue，降级回方案 A 或 B
//         history.pushState({}, "", url);
//         window.dispatchEvent(new PopStateEvent('popstate'));
//     }
// });

window.addEventListener('message', (event) => {
    if (event.data && event.data.action === 'simu_click') {
        const targetUrl = event.data.url;

        // 创建一个临时的 a 标签
        const a = document.createElement('a');
        a.href = targetUrl;
        a.style.display = 'none';
        document.body.appendChild(a);

        // 模拟原生点击
        // 注意：简单的 a.click() 在某些 React 版本可能被拦截
        // 使用 MouseEvent 模拟更真实
        const clickEvent = new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true,
            ctrlKey: false
        });
        a.dispatchEvent(clickEvent);

        // 清理
        a.remove();
    }
});

