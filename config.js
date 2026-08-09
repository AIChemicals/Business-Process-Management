// Адрес бэкенда. Локально — uvicorn на 8000; в проде — сервис на Render.
// Файл нарочно не модуль: подключается до app.js и просто задаёт глобальную
// переменную, чтобы адрес можно было поменять без пересборки.
(function () {
    var isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    window.BPM_API_BASE = isLocal
        ? 'http://localhost:8000'
        // Имя сервиса из render.yaml. Если Render добавил суффикс к имени
        // (имя занято глобально) — поправьте адрес здесь.
        : 'https://bpm-platform-backend.onrender.com';
})();
