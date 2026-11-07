// UI dictionaries. A module with no dependencies: it is imported by pure utilities
// and by node tests. React hooks and backend sync live in i18n.ts.

export type Locale = 'ru' | 'en';
export type LocalePreference = 'auto' | Locale;

const ru = {
  'nav.new': 'Новая загрузка',
  'nav.active': 'Активные',
  'nav.history': 'История',
  'nav.settings': 'Настройки',
  'nav.sections': 'Разделы',
  'nav.recent': 'Недавние',
  'nav.empty': 'Пока пусто',

  'window.minimize': 'Свернуть',
  'window.maximize': 'Развернуть',
  'window.close': 'Свернуть в трей',
  'common.close': 'Закрыть',
  'common.save': 'Сохранить',
  'common.delete': 'Удалить',
  'common.cancel': 'Отмена',
  'common.download': 'Скачать',
  'common.selectAll': 'Выбрать всё',
  'common.unselectAll': 'Снять всё',
  'common.downloading': 'Скачиваю…',
  'common.untitled': 'Без названия',
  'common.unknownError': 'Неизвестная ошибка',
  'common.cancelled': 'Загрузка отменена',
  'common.other': 'Другой',
  'common.source': 'Источник',
  'common.video': 'видео',
  'common.audio': 'аудио',

  interrupted: 'Прервано: приложение закрылось во время загрузки',

  'composer.placeholder': 'Вставьте ссылку на видео, пост или канал',
  'composer.paste': 'Вставить из буфера',
  'composer.mode.video': 'Видео',
  'composer.mode.video.hint': 'Обычная ссылка на ролик',
  'composer.mode.audio': 'Аудио',
  'composer.mode.audio.hint': 'Только звуковая дорожка',
  'composer.mode.post': 'Пост Boosty',
  'composer.mode.post.hint': 'Все видео и аудио одного поста',
  'composer.mode.channel': 'Канал Boosty',
  'composer.mode.channel.hint': 'Лента автора или бандл',
  'composer.quality.best': 'Лучшее',
  'composer.cookiesSaved': 'Cookies для {site} сохранены',
  'composer.cookiesAdd': 'Добавить cookies для {site}',
  'composer.analyze': 'Разобрать ссылку',
  'composer.cancelAnalyze': 'Отменить анализ',
  'composer.analyzing': 'Разбираю ссылку…',

  'download.title': 'Что скачать?',
  'download.subtitle': 'Видео по ссылке или платные посты Boosty по вашей подписке',
  'download.cookiesFor': 'Cookies для {site}',
  'download.cookiesPlaceholder': 'Вставьте cookies для {site}...\n# Netscape HTTP Cookie File',
  'download.cookiesHint': 'Для Boosty проще импорт из браузера: Настройки → Boosty.',
  'download.analyzeFailed': 'Не удалось разобрать ссылку',
  'download.chooseFormat': 'Выберите формат',
  'download.noFormats': 'yt-dlp не нашёл скачиваемых форматов',
  'download.batchDefault': 'Скачиваю выбранное…',
  'download.failed': 'Загрузка не завершилась',
  'download.partial': 'Не всё скачалось: {errors}',
  'download.noMedia': '{title}: нет доступных видео или аудио',
  'download.part': 'Дорожка {n}',
  'download.merging': 'Склейка видео и аудио…',
  'download.postLabel': 'Пост',
  'download.postN': 'Пост {n}/{total}',
  'download.loadingFeed': 'Загружаю всю ленту…',
  'download.toolsMissing':
    'Для скачивания нужны yt-dlp и FFmpeg (~135 МБ). Они ставятся один раз рядом с программой.',
  'download.toolsInstall': 'Скачать компоненты',

  'boosty.videoCount': '{n} видео',
  'boosty.audioCount': '{n} аудио',
  'boosty.kind.external': 'внешнее видео',
  'boosty.blocked':
    'Пост доступен по подписке. Нужна подписка на автора или свежие cookies Boosty.',
  'boosty.mediaHidden': 'Медиа скрыто: нужна подписка',
  'boosty.noMediaUrl': 'У элемента нет прямой ссылки',
  'boosty.noMedia': 'В этом посте нет доступных видео или аудио',
  'boosty.selected': 'Выбрано {n}',
  'boosty.downloadSelected': 'Скачать выбранное',
  'boosty.bundle': 'Бандл',
  'boosty.channel': 'Канал',
  'boosty.posts': '{n} постов',
  'boosty.postsFirst': 'первые {n} постов',
  'boosty.noMediaShort': 'нет видео или аудио',
  'boosty.hiddenInList': 'состав не показан в списке',
  'boosty.noAccess': 'нет доступа',
  'boosty.selectedOf': 'Выбрано {n} из {total}',
  'boosty.downloadSelectedN': 'Скачать выбранные ({n})',
  'boosty.downloadFeed': 'Вся доступная лента',
  'boosty.downloadFeedHint':
    'Загрузить все посты автора, открытые вашей подпиской, и скачать их по очереди',

  'active.title': 'Активные загрузки',
  'active.empty': 'Сейчас ничего не качается',
  'active.emptyHint': 'Запустите загрузку на экране «Новая загрузка»',

  'history.title': 'История загрузок',
  'history.search': 'Поиск...',
  'history.clear': 'Очистить',
  'history.clearConfirm': 'Очистить всю историю загрузок?',
  'history.all': 'Все ({n})',
  'history.video': 'Видео',
  'history.audio': 'Аудио',
  'history.failed': 'Ошибки',
  'history.notFound': 'Ничего не найдено',
  'history.empty': 'История пуста',
  'history.changeFilters': 'Попробуйте изменить фильтры',
  'history.emptyHint': 'Скачайте видео, чтобы оно появилось здесь',
  'history.done': 'Готово',
  'history.error': 'Ошибка',
  'history.downloading': 'Загрузка',
  'history.remove': 'Удалить из истории',
  'history.justNow': 'Только что',
  'history.minutes': '{n} мин назад',
  'history.hours': '{n} ч назад',
  'history.days': '{n} дн назад',
  'history.cancelled': 'Отменено',

  'format.audio': 'аудио',
  'cookies.empty': 'Пустой файл cookies',
  'cookies.unknownFormat':
    'Не распознан формат cookies. Нужен Netscape cookies.txt или JSON экспорт.',
  'format.withAudio': ' + звук',
  'format.noAudio': ' • без звука',

  'settings.title': 'Настройки',
  'settings.folder': 'Папка загрузок',
  'settings.browse': 'Обзор...',
  'settings.folderHint': 'Файлы будут сохраняться в эту папку',
  'settings.quality': 'Предпочтительное качество',
  'settings.qualityHint': 'Подставляется в новые загрузки',
  'settings.language': 'Язык',
  'settings.language.auto': 'Как в Windows',

  'settings.boosty.title': 'Boosty',
  'settings.boosty.intro':
    'Вход по вашим cookies: программа видит то же, что и вы на boosty.to, включая платные посты по подписке. Cookies хранятся зашифрованными (Windows DPAPI) и не пишутся в логи.',
  'settings.boosty.fromBrowser': 'Импорт из браузера',
  'settings.boosty.browserHint':
    'Войдите на boosty.to в выбранном браузере. Chromium-браузеры иногда держат базу открытой — закройте их перед импортом; надёжнее всего Firefox.',
  'settings.boosty.import': 'Импортировать',
  'settings.boosty.fromFile': 'Из файла…',
  'settings.boosty.check': 'Проверить вход',
  'settings.boosty.logout': 'Удалить cookies',
  'settings.boosty.notLogged': 'Вход не выполнен',
  'settings.boosty.logged': 'Вход выполнен',
  'settings.boosty.expires': 'токен до {date}',
  'settings.boosty.autoRefresh': 'обновляется автоматически',
  'settings.boosty.subscriptions': 'Подписки: {list}',
  'settings.boosty.noSubscriptions': 'Активных подписок нет',
  'settings.boosty.imported': 'Импортировано cookies: {n}',
  'settings.boosty.checking': 'Проверяю…',

  'settings.cookies.title': 'Cookies для других сайтов',
  'settings.cookies.hint':
    'Вставьте cookies.txt или JSON-экспорт. Сохранённые cookies зашифрованы и не показываются повторно.',
  'settings.cookies.importFile': 'Импорт из файла...',
  'settings.cookies.saved': 'Сохранено',
  'settings.cookies.deleted': 'Удалено',
  'settings.cookies.stored': 'Cookies сохранены и зашифрованы. Вставьте новые, чтобы заменить.',
  'settings.cookies.placeholder':
    'Вставьте cookies для {site}...\n\nФорматы:\n• Netscape cookies.txt\n• JSON-массив cookies\n• Boosty API токены: {"accessToken":"...","refreshToken":"...","deviceId":"..."}',
  'settings.cookies.jsonTokens': 'Обнаружены Boosty API токены. Конвертировать в cookies?',
  'settings.cookies.jsonCookies': 'Обнаружен JSON cookies. Конвертировать в Netscape?',
  'settings.cookies.convert': 'Конвертировать',
  'settings.cookies.hide': 'Скрыть',
  'settings.cookies.error': 'Ошибка: {error}',

  'settings.tools.title': 'Компоненты',
  'settings.tools.hint':
    'yt-dlp {ytdlp} и FFmpeg {ffmpeg} не вшиты в программу: они скачиваются один раз с GitHub, SHA-256 сверяется с закреплённым значением.',
  'settings.tools.ready': 'Установлено',
  'settings.tools.missing': 'Не установлено',
  'settings.tools.install': 'Скачать',
  'settings.tools.folder': 'Папка: {dir}',
  'settings.tools.download': 'Скачиваю {tool}: {done} МБ{total}',
  'settings.tools.verify': 'Проверяю SHA-256 {tool}…',
  'settings.tools.extract': 'Распаковываю {tool}…',
  'settings.tools.retry': 'Обрыв, повторяю {tool}…',

  'about.title': 'О программе',
  'about.tagline': 'Скачивание видео с 1000+ сайтов и платных постов Boosty по вашей подписке.',
  'about.portable': 'Portable: установка не нужна, обновление — заменой файла.',
  'about.license':
    'Лицензия Apache-2.0. Условия — в файлах LICENSE и NOTICE.',
  'about.repo': 'Репозиторий',
} as const;

export type MessageKey = keyof typeof ru;

const en: Record<MessageKey, string> = {
  'nav.new': 'New download',
  'nav.active': 'Active',
  'nav.history': 'History',
  'nav.settings': 'Settings',
  'nav.sections': 'Sections',
  'nav.recent': 'Recent',
  'nav.empty': 'Nothing yet',

  'window.minimize': 'Minimize',
  'window.maximize': 'Maximize',
  'window.close': 'Hide to tray',
  'common.close': 'Close',
  'common.save': 'Save',
  'common.delete': 'Delete',
  'common.cancel': 'Cancel',
  'common.download': 'Download',
  'common.selectAll': 'Select all',
  'common.unselectAll': 'Clear selection',
  'common.downloading': 'Downloading…',
  'common.untitled': 'Untitled',
  'common.unknownError': 'Unknown error',
  'common.cancelled': 'Download cancelled',
  'common.other': 'Other',
  'common.source': 'Source',
  'common.video': 'video',
  'common.audio': 'audio',

  interrupted: 'Interrupted: the app was closed during the download',

  'composer.placeholder': 'Paste a link to a video, post or channel',
  'composer.paste': 'Paste from clipboard',
  'composer.mode.video': 'Video',
  'composer.mode.video.hint': 'A regular video link',
  'composer.mode.audio': 'Audio',
  'composer.mode.audio.hint': 'Audio track only',
  'composer.mode.post': 'Boosty post',
  'composer.mode.post.hint': 'All videos and audio of one post',
  'composer.mode.channel': 'Boosty channel',
  'composer.mode.channel.hint': "Author's feed or a bundle",
  'composer.quality.best': 'Best',
  'composer.cookiesSaved': 'Cookies for {site} are saved',
  'composer.cookiesAdd': 'Add cookies for {site}',
  'composer.analyze': 'Analyze link',
  'composer.cancelAnalyze': 'Cancel analysis',
  'composer.analyzing': 'Analyzing link…',

  'download.title': 'What to download?',
  'download.subtitle': 'Videos by link, or paid Boosty posts with your own subscription',
  'download.cookiesFor': 'Cookies for {site}',
  'download.cookiesPlaceholder': 'Paste cookies for {site}...\n# Netscape HTTP Cookie File',
  'download.cookiesHint': 'For Boosty, importing from the browser is easier: Settings → Boosty.',
  'download.analyzeFailed': 'Could not analyze the link',
  'download.chooseFormat': 'Choose a format',
  'download.noFormats': 'yt-dlp found no downloadable formats',
  'download.batchDefault': 'Downloading the selection…',
  'download.failed': 'The download did not finish',
  'download.partial': 'Not everything was downloaded: {errors}',
  'download.noMedia': '{title}: no available video or audio',
  'download.part': 'Track {n}',
  'download.merging': 'Merging video and audio…',
  'download.postLabel': 'Post',
  'download.postN': 'Post {n}/{total}',
  'download.loadingFeed': 'Loading the whole feed…',
  'download.toolsMissing':
    'Downloading needs yt-dlp and FFmpeg (~135 MB). They are installed once next to the app.',
  'download.toolsInstall': 'Download components',

  'boosty.videoCount': '{n} video{s}',
  'boosty.audioCount': '{n} audio',
  'boosty.kind.external': 'external video',
  'boosty.blocked':
    'The post is for subscribers. You need a subscription to the author or fresh Boosty cookies.',
  'boosty.mediaHidden': 'Media hidden: subscription required',
  'boosty.noMediaUrl': 'The item has no direct link',
  'boosty.noMedia': 'This post has no available video or audio',
  'boosty.selected': 'Selected {n}',
  'boosty.downloadSelected': 'Download selected',
  'boosty.bundle': 'Bundle',
  'boosty.channel': 'Channel',
  'boosty.posts': '{n} post{s}',
  'boosty.postsFirst': 'first {n} posts',
  'boosty.noMediaShort': 'no video or audio',
  'boosty.hiddenInList': 'contents not shown in the list',
  'boosty.noAccess': 'no access',
  'boosty.selectedOf': 'Selected {n} of {total}',
  'boosty.downloadSelectedN': 'Download selected ({n})',
  'boosty.downloadFeed': 'Whole accessible feed',
  'boosty.downloadFeedHint':
    'Load every post of the author that your subscription unlocks and download them one by one',

  'active.title': 'Active downloads',
  'active.empty': 'Nothing is downloading',
  'active.emptyHint': 'Start a download on the “New download” screen',

  'history.title': 'Download history',
  'history.search': 'Search...',
  'history.clear': 'Clear',
  'history.clearConfirm': 'Clear the whole download history?',
  'history.all': 'All ({n})',
  'history.video': 'Video',
  'history.audio': 'Audio',
  'history.failed': 'Errors',
  'history.notFound': 'Nothing found',
  'history.empty': 'History is empty',
  'history.changeFilters': 'Try changing the filters',
  'history.emptyHint': 'Download a video to see it here',
  'history.done': 'Done',
  'history.error': 'Error',
  'history.downloading': 'Downloading',
  'history.remove': 'Remove from history',
  'history.justNow': 'Just now',
  'history.minutes': '{n} min ago',
  'history.hours': '{n} h ago',
  'history.days': '{n} d ago',
  'history.cancelled': 'Cancelled',

  'format.audio': 'audio',
  'cookies.empty': 'The cookies file is empty',
  'cookies.unknownFormat':
    'Unknown cookies format. Netscape cookies.txt or a JSON export is required.',
  'format.withAudio': ' + audio',
  'format.noAudio': ' • no audio',

  'settings.title': 'Settings',
  'settings.folder': 'Download folder',
  'settings.browse': 'Browse...',
  'settings.folderHint': 'Files are saved to this folder',
  'settings.quality': 'Preferred quality',
  'settings.qualityHint': 'Used for new downloads',
  'settings.language': 'Language',
  'settings.language.auto': 'Same as Windows',

  'settings.boosty.title': 'Boosty',
  'settings.boosty.intro':
    'Sign-in with your own cookies: the app sees what you see on boosty.to, including paid posts of your subscriptions. Cookies are stored encrypted (Windows DPAPI) and never written to logs.',
  'settings.boosty.fromBrowser': 'Import from browser',
  'settings.boosty.browserHint':
    'Sign in to boosty.to in the chosen browser. Chromium browsers may keep the database locked — close them before importing; Firefox is the most reliable.',
  'settings.boosty.import': 'Import',
  'settings.boosty.fromFile': 'From file…',
  'settings.boosty.check': 'Check sign-in',
  'settings.boosty.logout': 'Delete cookies',
  'settings.boosty.notLogged': 'Not signed in',
  'settings.boosty.logged': 'Signed in',
  'settings.boosty.expires': 'token until {date}',
  'settings.boosty.autoRefresh': 'refreshed automatically',
  'settings.boosty.subscriptions': 'Subscriptions: {list}',
  'settings.boosty.noSubscriptions': 'No active subscriptions',
  'settings.boosty.imported': 'Cookies imported: {n}',
  'settings.boosty.checking': 'Checking…',

  'settings.cookies.title': 'Cookies for other sites',
  'settings.cookies.hint':
    'Paste cookies.txt or a JSON export. Saved cookies are encrypted and never shown again.',
  'settings.cookies.importFile': 'Import from file...',
  'settings.cookies.saved': 'Saved',
  'settings.cookies.deleted': 'Deleted',
  'settings.cookies.stored': 'Cookies are saved and encrypted. Paste new ones to replace them.',
  'settings.cookies.placeholder':
    'Paste cookies for {site}...\n\nFormats:\n• Netscape cookies.txt\n• JSON cookie array\n• Boosty API tokens: {"accessToken":"...","refreshToken":"...","deviceId":"..."}',
  'settings.cookies.jsonTokens': 'Boosty API tokens detected. Convert to cookies?',
  'settings.cookies.jsonCookies': 'JSON cookies detected. Convert to Netscape?',
  'settings.cookies.convert': 'Convert',
  'settings.cookies.hide': 'Hide',
  'settings.cookies.error': 'Error: {error}',

  'settings.tools.title': 'Components',
  'settings.tools.hint':
    'yt-dlp {ytdlp} and FFmpeg {ffmpeg} are not bundled: they are downloaded once from GitHub and checked against a pinned SHA-256.',
  'settings.tools.ready': 'Installed',
  'settings.tools.missing': 'Not installed',
  'settings.tools.install': 'Download',
  'settings.tools.folder': 'Folder: {dir}',
  'settings.tools.download': 'Downloading {tool}: {done} MB{total}',
  'settings.tools.verify': 'Verifying SHA-256 of {tool}…',
  'settings.tools.extract': 'Extracting {tool}…',
  'settings.tools.retry': 'Connection dropped, retrying {tool}…',

  'about.title': 'About',
  'about.tagline':
    'Download videos from 1000+ sites and paid Boosty posts with your own subscription.',
  'about.portable': 'Portable: no installation, update by replacing the file.',
  'about.license':
    'Apache-2.0 license. Terms are in the LICENSE and NOTICE files.',
  'about.repo': 'Repository',
};

const DICTIONARIES: Record<Locale, Record<MessageKey, string>> = { ru, en };

export function systemLocale(): Locale {
  const language = typeof navigator === 'undefined' ? 'ru' : navigator.language;
  return language.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

export function resolveLocale(preference: LocalePreference): Locale {
  return preference === 'auto' ? systemLocale() : preference;
}

export function format(locale: Locale, key: MessageKey, vars?: Record<string, string | number>) {
  const template = DICTIONARIES[locale][key] ?? ru[key];
  if (!vars) return template;
  // {s} is the English plural suffix for {n}; Russian templates do not have it
  if ('n' in vars && !('s' in vars)) vars = { ...vars, s: Number(vars.n) === 1 ? '' : 's' };
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

let current: Locale = systemLocale();

/** Set from MainLayout on startup and on language change. */
export function setCurrentLocale(locale: Locale) {
  current = locale;
}

/** Outside React (handlers, utilities, errors): the current UI language. */
export function translate(key: MessageKey, vars?: Record<string, string | number>) {
  return format(current, key, vars);
}
