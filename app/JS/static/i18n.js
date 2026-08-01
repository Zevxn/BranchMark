// The standalone mind-map UI is Chinese-only. Keeping this tiny lookup helper
// lets existing bookmark templates use their data-i18n attributes without a
// language setting, network request or storage listener.
const currentLocaleData = window.__DEEPCONVO_STANDALONE_ZH_CN__ || {};

function getI18nText(path) {
    if (!path) return '';
    let value = currentLocaleData;
    for (const part of path.split('.')) {
        value = value?.[part];
        if (value == null) return path;
    }
    return String(value);
}

function renderLanguage(root = document) {
    root.querySelectorAll('[data-i18n]').forEach(element => {
        element.textContent = getI18nText(element.dataset.i18n);
    });
    root.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
        element.placeholder = getI18nText(element.dataset.i18nPlaceholder);
    });
    root.querySelectorAll('[data-i18n-title]').forEach(element => {
        element.title = getI18nText(element.dataset.i18nTitle);
    });
}

function showTopToast(message, duration = 1500) {
    const toast = document.createElement('div');
    toast.textContent = message;
    Object.assign(toast.style, {
        position: 'fixed',
        top: '40px',
        right: '20px',
        transform: 'translateX(50px)',
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        color: '#fff',
        padding: '10px 15px',
        borderRadius: '8px',
        fontSize: '14px',
        fontWeight: '500',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        zIndex: '9999',
        opacity: '0',
        transition: 'all 0.5s cubic-bezier(0.18, 0.89, 0.32, 1.28)',
        pointerEvents: 'none',
    });
    document.body.appendChild(toast);
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(0)';
    });
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(50px)';
        setTimeout(() => toast.remove(), 500);
    }, duration);
}

window.getI18nText = getI18nText;
window.renderLanguage = renderLanguage;
window.showTopToast = showTopToast;
