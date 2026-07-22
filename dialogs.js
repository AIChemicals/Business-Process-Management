import translations from './locale.js?v=1.0.5';

let currentLanguage = 'ru';

export function setDialogsLanguage(lang) {
    currentLanguage = lang;
}

function getTranslation(key, defaultText) {
    const dict = translations[currentLanguage];
    return (dict && dict[key]) || defaultText;
}

export function customAlert(message, title = '') {
    return new Promise((resolve) => {
        const modal = document.getElementById('modal-custom-dialog');
        const titleEl = document.getElementById('custom-dialog-title');
        const msgEl = document.getElementById('custom-dialog-message');
        const inputsContainer = document.getElementById('custom-dialog-inputs-container');
        const cancelBtn = document.getElementById('custom-dialog-cancel');
        const confirmBtn = document.getElementById('custom-dialog-confirm');
        const closeBtn = document.getElementById('custom-dialog-close');

        if (!modal) {
            alert(message);
            resolve();
            return;
        }

        // Set content
        titleEl.textContent = title || getTranslation('notification', 'Уведомление');
        msgEl.textContent = message;
        msgEl.style.display = 'block';
        inputsContainer.innerHTML = '';
        
        // Buttons: only confirm/OK for alert
        cancelBtn.style.display = 'none';
        confirmBtn.textContent = 'OK';
        confirmBtn.className = 'btn btn-primary';
        
        // Show
        modal.classList.add('active');

        // Cleanup & resolve handler
        function cleanup() {
            modal.classList.remove('active');
            confirmBtn.removeEventListener('click', onConfirm);
            closeBtn.removeEventListener('click', onCancel);
            document.removeEventListener('keydown', onKeyDown);
        }

        function onConfirm() {
            cleanup();
            resolve();
        }

        function onCancel() {
            cleanup();
            resolve();
        }

        function onKeyDown(e) {
            if (e.key === 'Escape' || e.key === 'Enter') {
                cleanup();
                resolve();
            }
        }

        confirmBtn.addEventListener('click', onConfirm);
        closeBtn.addEventListener('click', onCancel);
        document.addEventListener('keydown', onKeyDown);
    });
}

export function customConfirm(message, title = '') {
    return new Promise((resolve) => {
        const modal = document.getElementById('modal-custom-dialog');
        const titleEl = document.getElementById('custom-dialog-title');
        const msgEl = document.getElementById('custom-dialog-message');
        const inputsContainer = document.getElementById('custom-dialog-inputs-container');
        const cancelBtn = document.getElementById('custom-dialog-cancel');
        const confirmBtn = document.getElementById('custom-dialog-confirm');
        const closeBtn = document.getElementById('custom-dialog-close');

        if (!modal) {
            const res = confirm(message);
            resolve(res);
            return;
        }

        // Set content
        titleEl.textContent = title || (currentLanguage === 'ru' ? 'Подтверждение' : 'Растау');
        msgEl.textContent = message;
        msgEl.style.display = 'block';
        inputsContainer.innerHTML = '';

        // Buttons
        cancelBtn.style.display = 'inline-flex';
        cancelBtn.textContent = getTranslation('cancel', 'Отмена');
        confirmBtn.textContent = currentLanguage === 'ru' ? 'Да' : 'Иә';
        confirmBtn.className = 'btn btn-danger';

        // Show
        modal.classList.add('active');

        function cleanup() {
            modal.classList.remove('active');
            confirmBtn.removeEventListener('click', onConfirm);
            cancelBtn.removeEventListener('click', onCancel);
            closeBtn.removeEventListener('click', onCancel);
            document.removeEventListener('keydown', onKeyDown);
        }

        function onConfirm() {
            cleanup();
            resolve(true);
        }

        function onCancel() {
            cleanup();
            resolve(false);
        }

        function onKeyDown(e) {
            if (e.key === 'Escape') {
                cleanup();
                resolve(false);
            } else if (e.key === 'Enter') {
                cleanup();
                resolve(true);
            }
        }

        confirmBtn.addEventListener('click', onConfirm);
        cancelBtn.addEventListener('click', onCancel);
        closeBtn.addEventListener('click', onCancel);
        document.addEventListener('keydown', onKeyDown);
    });
}

export function customPrompt({ title, label, defaultValue, confirmBtnText }) {
    return new Promise((resolve) => {
        const modal = document.getElementById('modal-custom-dialog');
        const titleEl = document.getElementById('custom-dialog-title');
        const msgEl = document.getElementById('custom-dialog-message');
        const inputsContainer = document.getElementById('custom-dialog-inputs-container');
        const cancelBtn = document.getElementById('custom-dialog-cancel');
        const confirmBtn = document.getElementById('custom-dialog-confirm');
        const closeBtn = document.getElementById('custom-dialog-close');

        if (!modal) {
            const val = prompt(label, defaultValue);
            resolve(val);
            return;
        }

        // Title
        titleEl.textContent = title;
        msgEl.style.display = 'none'; // hide message
        
        // Create single input with placeholder
        inputsContainer.innerHTML = `
            <div class="form-group">
                <label for="prompt-single-input">${label}</label>
                <input type="text" class="form-control" id="prompt-single-input" placeholder="${defaultValue}" value="">
            </div>
        `;

        const inputEl = document.getElementById('prompt-single-input');

        // Buttons
        cancelBtn.style.display = 'inline-flex';
        cancelBtn.textContent = getTranslation('cancel', 'Отмена');
        confirmBtn.textContent = confirmBtnText || getTranslation('add', 'Добавить');
        confirmBtn.className = 'btn btn-primary';

        // Focus the input
        setTimeout(() => inputEl.focus(), 100);

        // Show
        modal.classList.add('active');

        function cleanup() {
            modal.classList.remove('active');
            confirmBtn.removeEventListener('click', onConfirm);
            cancelBtn.removeEventListener('click', onCancel);
            closeBtn.removeEventListener('click', onCancel);
            document.removeEventListener('keydown', onKeyDown);
        }

        function onConfirm() {
            let val = inputEl.value.trim();
            if (val === '') {
                val = defaultValue;
            }
            cleanup();
            resolve(val);
        }

        function onCancel() {
            cleanup();
            resolve(null);
        }

        function onKeyDown(e) {
            if (e.key === 'Escape') {
                cleanup();
                resolve(null);
            } else if (e.key === 'Enter') {
                onConfirm();
            }
        }

        confirmBtn.addEventListener('click', onConfirm);
        cancelBtn.addEventListener('click', onCancel);
        closeBtn.addEventListener('click', onCancel);
        document.addEventListener('keydown', onKeyDown);
    });
}
