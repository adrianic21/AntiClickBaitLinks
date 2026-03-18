import React, { useState, useEffect, useRef } from 'react';
import { Search, Link as LinkIcon, Loader2, ShieldCheck, Globe, ArrowRight, AlertCircle, Settings, Key, X, Check, Languages, Volume2, VolumeX, Info, Copy, CopyCheck, Lock, Clipboard, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { summarizeUrl, type Provider, type ApiKeys } from './services/geminiService';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const LANGUAGES = [
  { code: 'Spanish', name: 'Español', flag: '🇪🇸' },
  { code: 'English', name: 'English', flag: '🇺🇸' },
  { code: 'Portuguese', name: 'Português', flag: '🇧🇷' },
  { code: 'French', name: 'Français', flag: '🇫🇷' },
  { code: 'German', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'Italian', name: 'Italiano', flag: '🇮🇹' },
];

const UI_TRANSLATIONS = {
  English: {
    title: "AntiClickBaitLinks",
    placeholder: "Paste link",
    summarize: "Reveal Truth",
    realSummary: "The Reveal",
    clear: "Clear",
    settingsTitle: "API Configuration",
    settingsDesc: "Enter your API Key to make the app work. It will be saved locally in your browser.",
    saveBtn: "Save Configuration",
    pasteLink: "Paste link",
    clearLink: "Clear",
    noKeyLink: "Don't have a key? Get it here for FREE",
    invalidUrl: "Please enter a valid link.",
    genericError: "We couldn't process this link. Make sure it's public and accessible.",
    noKeyError: "API Key not configured. Please enter your API Key in settings.",
    quotaError: "Quota exceeded. Please wait a moment before trying again.",
    uiLang: "Interface Language",
    apiProvider: "API Provider",
    listen: "Listen",
    stop: "Stop",
    expandMedium: "More details",
    expandLong: "Full summary",
    explainChild: "Explain to a 10-year-old",
    infoTitle: "About AntiClickBaitLinks",
    infoDesc: "AntiClickBaitLinks uses AI to reveal the truth behind sensationalist headlines, saving you from clickbait. Paste any link and get an instant summary.",
    infoHowToTitle: "How to use",
    infoStep1Title: "1. Get your API Key",
    infoStep1Desc: "Request your FREE key from Gemini (Google), Cohere, or OpenRouter by clicking one of the links below.",
    infoStep2Title: "2. Copy it and paste it in AntiClickBaitLinks",
    infoStep2Desc: "Paste your key in the settings (gear icon). You can activate all 3 APIs at the same time for better performance.",
    infoApiPrivacyTitle: "Is my API Key safe?",
    infoApiPrivacyDesc: "Yes. Your key is stored ONLY in your browser's local storage. It is never sent to our servers or shared with anyone.",
    infoLimitsTitle: "Free Version",
    infoLimitsDesc: "You can perform 5 free summaries every 24 hours. A countdown will appear once you reach the limit.",
    infoPremiumTitle: "Premium Version",
    infoPremiumDesc: "Get unlimited access forever and remove all limits with a one-time payment.",
    dontShowAgain: "Don't show again on startup",
    closeBtn: "Close",
    copy: "Copy",
    copied: "Copied!",
    lockTitle: "Daily Limit Reached",
    lockDesc: "You have reached the limit of 5 free summaries per 24 hours. Wait for the limit to reset or unlock the app forever.",
    unlockPlaceholder: "Paste your Premium token here",
    unlockBtn: "Activate Premium",
    buyBtn: "Buy Premium",
    resetIn: "Reset in",
    statusFree: "Free Account",
    statusPremium: "Premium Account",
    remainingSearches: "Remaining searches",
    limitReset: "Limit resets in",
    unlimited: "Unlimited",
    alreadyPremium: "Already Premium?",
    invalidPass: "Invalid token. Please check and try again.",
    apiKeyActive: "API Key configured correctly",
    apiKeyMissing: "No API Key configured",
    apiKeyGuide1: "Get your FREE key from",
    apiKeyGuide2: "Paste it in the settings (gear icon ⚙️)",
    apiKeyOr: "or",
    installApp: "Install App",
    pasteError: "Clipboard access blocked. Please use Ctrl+V (or Cmd+V) to paste."
  },
  Spanish: {
    title: "AntiClickBaitLinks",
    placeholder: "Pegar link",
    summarize: "Revelar Verdad",
    realSummary: "La Respuesta",
    clear: "Limpiar",
    settingsTitle: "Configuración API",
    settingsDesc: "Introduce tu API Key para que la app funcione. Se guardará localmente en tu navegador.",
    saveBtn: "Guardar Configuración",
    pasteLink: "Pegar link",
    clearLink: "Borrar",
    noKeyLink: "¿No tienes una clave? Consíguela GRATIS aquí",
    invalidUrl: "Por favor, introduce un link válido.",
    genericError: "No pudimos procesar este link. Asegúrate de que sea público y accesible.",
    noKeyError: "API Key no configurada. Por favor, introduce tu API Key en la configuración.",
    quotaError: "Cuota excedida. Por favor, espera un momento antes de intentarlo de nuevo.",
    uiLang: "Idioma de la Interfaz",
    apiProvider: "Proveedor de API",
    listen: "Escuchar",
    stop: "Detener",
    expandMedium: "Más amplia",
    expandLong: "Mucho más amplia",
    explainChild: "Explicar a un niño de 10 años",
    infoTitle: "Sobre AntiClickBaitLinks",
    infoDesc: "AntiClickBaitLinks utiliza IA para revelar la verdad tras titulares sensacionalistas, evitándote caer en el clickbait. Pega cualquier enlace de internet y recibe un resumen instantáneo.",
    infoHowToTitle: "¿Cómo usarlo?",
    infoStep1Title: "1. Consigue tu API Key",
    infoStep1Desc: "Solicita tu clave GRATUITA en Gemini (Google), Cohere u OpenRouter haciendo clic en uno de los siguientes enlaces.",
    infoStep2Title: "2. Cópiala y pégala en AntiClickBaitLinks",
    infoStep2Desc: "Pega tu clave en los ajustes (icono de engranaje). Puedes activar las 3 APIs al mismo tiempo para un mejor rendimiento.",
    infoApiPrivacyTitle: "¿Es segura mi API Key?",
    infoApiPrivacyDesc: "Sí. Tu clave se guarda ÚNICAMENTE en el almacenamiento local de tu navegador. Nunca se envía a nuestros servidores ni se comparte con nadie.",
    infoLimitsTitle: "Versión Gratuita",
    infoLimitsDesc: "Puedes realizar 5 resúmenes gratuitos cada 24 horas. Aparecerá una cuenta atrás cuando alcances el límite.",
    infoPremiumTitle: "Versión Premium",
    infoPremiumDesc: "Obtén acceso ilimitado para siempre y elimina todas las restricciones con un único pago.",
    dontShowAgain: "No volver a mostrar al inicio",
    closeBtn: "Cerrar",
    copy: "Copiar",
    copied: "¡Copiado!",
    lockTitle: "Límite Diario Alcanzado",
    lockDesc: "Has alcanzado el límite de 5 resúmenes gratuitos cada 24 horas. Espera a que el límite se reinicie o desbloquea la app para siempre.",
    unlockPlaceholder: "Pega tu token Premium aquí",
    unlockBtn: "Activar Premium",
    buyBtn: "Comprar Premium",
    resetIn: "Se reinicia en",
    statusFree: "Cuenta Gratuita",
    statusPremium: "Cuenta Premium",
    remainingSearches: "Búsquedas restantes",
    limitReset: "Límite se reinicia en",
    unlimited: "Ilimitado",
    alreadyPremium: "¿Ya eres Premium?",
    invalidPass: "Token inválido. Compruébalo e inténtalo de nuevo.",
    apiKeyActive: "API Key configurada correctamente",
    apiKeyMissing: "API Key no configurada",
    apiKeyGuide1: "Consigue tu clave GRATIS en",
    apiKeyGuide2: "Pégala en los ajustes (icono de engranaje ⚙️)",
    apiKeyOr: "o",
    installApp: "Instalar App",
    pasteError: "Acceso al portapapeles bloqueado. Por favor, usa Ctrl+V (o Cmd+V) para pegar."
  },
  Portuguese: {
    title: "AntiClickBaitLinks",
    placeholder: "Colar link",
    summarize: "Revelar Verdade",
    realSummary: "A Resposta",
    clear: "Limpar",
    settingsTitle: "Configuração da API",
    settingsDesc: "Insira sua Gemini API Key para que o app funcione. Ela será salva localmente no seu navegador.",
    saveBtn: "Salvar Configuração",
    pasteLink: "Colar link",
    clearLink: "Limpar",
    noKeyLink: "Não tem uma chave? Obtenha aqui gratuitamente",
    invalidUrl: "Por favor, insira um link válido.",
    genericError: "Não conseguimos processar este link. Verifique se ele é público e acessível.",
    noKeyError: "API Key não configurada. Por favor, insira sua própria Gemini API Key nas configurações.",
    quotaError: "Cota excedida. Por favor, aguarde um momento antes de tentar novamente.",
    uiLang: "Idioma da Interface",
    apiProvider: "Provedor de API",
    listen: "Ouvir",
    stop: "Parar",
    expandMedium: "Mais detalhes",
    expandLong: "Resumo completo",
    explainChild: "Explicar para uma criança de 10 anos",
    infoTitle: "Sobre AntiClickBaitLinks",
    infoDesc: "O AntiClickBaitLinks usa IA para revelar a verdade por trás de manchetes sensacionalistas, evitando que você caia em clickbaits. Cole qualquer link e receba um resumo instantâneo.",
    infoHowToTitle: "Como usar",
    infoStep1Title: "1. Obtenha sua API Key",
    infoStep1Desc: "Solicite sua chave GRATUITA no Gemini (Google), Cohere ou OpenRouter clicando em um dos links abaixo.",
    infoStep2Title: "2. Copie e cole no AntiClickBaitLinks",
    infoStep2Desc: "Cole sua chave nas configurações (ícone de engrenagem). Você pode ativar as 3 APIs ao mesmo tempo para melhor desempenho.",
    infoApiPrivacyTitle: "Minha API Key está segura?",
    infoApiPrivacyDesc: "Sim. Sua chave é armazenada APENAS no armazenamento local do seu navegador. Ela nunca é enviada para nossos servidores ou compartilhada com ninguém.",
    infoLimitsTitle: "Versão Gratuita",
    infoLimitsDesc: "Você pode realizar 5 resumos gratuitos a cada 24 horas. Uma contagem regressiva aparecerá quando você atingir o limite.",
    infoPremiumTitle: "Versão Premium",
    infoPremiumDesc: "Obtenha acesso ilimitado para sempre e remova todas as restrições com um pagamento único.",
    dontShowAgain: "Não mostrar novamente ao iniciar",
    closeBtn: "Fechar",
    copy: "Copiar",
    copied: "Copiado!",
    lockTitle: "Limite Diário Atingido",
    lockDesc: "Você atingiu o limite de 5 resumos gratuitos por 24 horas. Aguarde o limite resetar ou desbloqueie o app para sempre.",
    unlockPlaceholder: "Cole seu token Premium aqui",
    unlockBtn: "Ativar Premium",
    buyBtn: "Comprar Premium",
    resetIn: "Reinicia em",
    statusFree: "Conta Gratuita",
    statusPremium: "Conta Premium",
    remainingSearches: "Buscas restantes",
    limitReset: "Limite reinicia em",
    unlimited: "Ilimitado",
    alreadyPremium: "Já é Premium?",
    invalidPass: "Token inválido. Verifique e tente novamente.",
    apiKeyActive: "API Key configurada corretamente",
    apiKeyMissing: "API Key não configurada",
    apiKeyGuide1: "Obtenha sua chave GRÁTIS em",
    apiKeyGuide2: "Cole nas configurações (ícone de engrenagem ⚙️)",
    apiKeyOr: "ou",
    installApp: "Instalar App",
    pasteError: "Acesso à área de transferência bloqueado. Use Ctrl+V (ou Cmd+V) para colar."
  },
  French: {
    title: "AntiClickBaitLinks",
    placeholder: "Coller le lien",
    summarize: "Révéler la Vérité",
    realSummary: "La Réponse",
    clear: "Effacer",
    settingsTitle: "Configuration de l'API",
    settingsDesc: "Entrez votre clé API Gemini pour faire fonctionner l'application. Elle sera enregistrée localement dans votre navigateur.",
    saveBtn: "Enregistrer la configuration",
    pasteLink: "Coller le lien",
    clearLink: "Effacer",
    noKeyLink: "Vous n'avez pas de clé ? Obtenez-la ici gratuitement",
    invalidUrl: "Veuillez entrer un lien valide.",
    genericError: "Nous n'avons pas pu traiter ce lien. Assurez-vous qu'il est public et accessible.",
    noKeyError: "Clé API non configurée. Veuillez entrer votre propre clé API Gemini dans les paramètres.",
    quotaError: "Quota dépassé. Veuillez patienter un moment avant de réessayer.",
    uiLang: "Langue de l'interface",
    apiProvider: "Fournisseur d'API",
    listen: "Écouter",
    stop: "Arrêter",
    expandMedium: "Plus de détails",
    expandLong: "Résumé complet",
    explainChild: "Expliquer à un enfant de 10 ans",
    infoTitle: "À propos d'AntiClickBaitLinks",
    infoDesc: "AntiClickBaitLinks utilise l'IA pour révéler la vérité derrière les titres sensationnalistes, vous évitant de tomber dans le piège du clickbait. Collez n'importe quel lien et recevez un résumé instantané.",
    infoHowToTitle: "Comment utiliser",
    infoStep1Title: "1. Obtenez votre clé API",
    infoStep1Desc: "Demandez votre clé GRATUITE auprès de Gemini (Google), Cohere ou OpenRouter en cliquant sur l'un des liens ci-dessous.",
    infoStep2Title: "2. Copiez-la et collez-la dans AntiClickBaitLinks",
    infoStep2Desc: "Collez votre clé dans les paramètres (icône d'engrenage). Vous pouvez activer les 3 API en même temps pour de meilleures performances.",
    infoApiPrivacyTitle: "Ma clé API est-elle sécurisée ?",
    infoApiPrivacyDesc: "Oui. Votre clé est stockée UNIQUEMENT dans le stockage local de votre navigateur. Elle n'est jamais envoyée à nos serveurs ni partagée avec qui que ce soit.",
    infoLimitsTitle: "Version Gratuite",
    infoLimitsDesc: "Vous pouvez effectuer 5 résumés gratuits toutes les 24 heures. Un compte à rebours apparaîtra une fois la limite atteinte.",
    infoPremiumTitle: "Version Premium",
    infoPremiumDesc: "Bénéficiez d'un accès illimité à vie et supprimez toutes les limites avec un paiement unique.",
    dontShowAgain: "Ne plus afficher au démarrage",
    closeBtn: "Fermer",
    copy: "Copier",
    copied: "Copié !",
    lockTitle: "Limite Quotidienne Atteinte",
    lockDesc: "Vous avez atteint la limite de 5 résumés gratuits par 24 heures. Attendez que la limite se réinitialise ou déverrouillez l'application pour toujours.",
    unlockPlaceholder: "Collez votre token Premium ici",
    unlockBtn: "Activer Premium",
    buyBtn: "Acheter Premium",
    resetIn: "Réinitialisation dans",
    statusFree: "Compte Gratuit",
    statusPremium: "Compte Premium",
    remainingSearches: "Recherches restantes",
    limitReset: "Limite réinitialisée dans",
    unlimited: "Illimité",
    alreadyPremium: "Déjà Premium ?",
    invalidPass: "Token invalide. Veuillez vérifier et réessayer.",
    apiKeyActive: "Clé API configurée correctement",
    apiKeyMissing: "Clé API non configurée",
    apiKeyGuide1: "Obtenez votre clé GRATUITE sur",
    apiKeyGuide2: "Collez-la dans les paramètres (icône d'engrenage ⚙️)",
    apiKeyOr: "ou",
    installApp: "Installer l'App",
    pasteError: "Accès au presse-papiers bloqué. Veuillez utiliser Ctrl+V (ou Cmd+V) pour coller."
  },
  German: {
    title: "AntiClickBaitLinks",
    placeholder: "Link einfügen",
    summarize: "Wahrheit enthüllen",
    realSummary: "Die Antwort",
    clear: "Löschen",
    settingsTitle: "API-Konfiguration",
    settingsDesc: "Geben Sie Ihren Gemini-API-Schlüssel ein, damit die App funktioniert. Er wird lokal in Ihrem Browser gespeichert.",
    saveBtn: "Konfiguration speichern",
    pasteLink: "Link einfügen",
    clearLink: "Löschen",
    noKeyLink: "Sie haben keinen Schlüssel? Hier kostenlos anfordern",
    invalidUrl: "Bitte geben Sie einen gültigen Link ein.",
    genericError: "Wir konnten diesen Link nicht verarbeiten. Stellen Sie sicher, dass er öffentlich und zugänglich ist.",
    noKeyError: "API-Schlüssel nicht konfiguriert. Bitte geben Sie Ihren eigenen Gemini-API-Schlüssel in den Einstellungen ein.",
    quotaError: "Kontingent überschritten. Bitte warten Sie einen Moment, bevor Sie es erneut versuchen.",
    uiLang: "Oberflächensprache",
    apiProvider: "API-Anbieter",
    listen: "Hören",
    stop: "Stopp",
    expandMedium: "Mehr Details",
    expandLong: "Vollständige Zusammenfassung",
    explainChild: "Einem 10-Jährigen erklären",
    infoTitle: "Über AntiClickBaitLinks",
    infoDesc: "AntiClickBaitLinks nutzt KI, um die Wahrheit hinter reißerischen Schlagzeilen zu enthüllen und Sie vor Clickbait zu schützen. Fügen Sie einen beliebigen Link ein und erhalten Sie sofort eine Zusammenfassung.",
    infoHowToTitle: "Bedienung",
    infoStep1Title: "1. API-Schlüssel anfordern",
    infoStep1Desc: "Fordern Sie Ihren KOSTENLOSEN Schlüssel bei Gemini (Google), Cohere oder OpenRouter an, indem Sie auf einen der folgenden Links klicken.",
    infoStep2Title: "2. Kopieren und in AntiClickBaitLinks einfügen",
    infoStep2Desc: "Fügen Sie Ihren Schlüssel in den Einstellungen (Zahnrad-Symbol) ein. Sie können alle 3 APIs gleichzeitig aktivieren für bessere Leistung.",
    infoApiPrivacyTitle: "Ist mein API-Schlüssel sicher?",
    infoApiPrivacyDesc: "Ja. Ihr Schlüssel wird NUR im lokalen Speicher Ihres Browsers gespeichert. Er wird niemals an unsere Server gesendet oder mit anderen geteilt.",
    infoLimitsTitle: "Kostenlose Version",
    infoLimitsDesc: "Sie können alle 24 Stunden 5 kostenlose Zusammenfassungen erstellen. Ein Countdown erscheint, sobald das Limit erreicht ist.",
    infoPremiumTitle: "Premium-Version",
    infoPremiumDesc: "Erhalten Sie lebenslangen unbegrenzten Zugriff und entfernen Sie alle Einschränkungen mit einer einmaligen Zahlung.",
    dontShowAgain: "Beim Start nicht mehr anzeigen",
    closeBtn: "Schließen",
    copy: "Kopieren",
    copied: "Kopiert!",
    lockTitle: "Tageslimit Erreicht",
    lockDesc: "Sie haben das Limit von 5 kostenlosen Zusammenfassungen pro 24 Stunden erreicht. Warten Sie, bis das Limit zurückgesetzt wird, oder schalten Sie die App dauerhaft frei.",
    unlockPlaceholder: "Premium-Token hier einfügen",
    unlockBtn: "Premium Aktivieren",
    buyBtn: "Premium Kaufen",
    resetIn: "Zurücksetzen in",
    statusFree: "Kostenloses Konto",
    statusPremium: "Premium-Konto",
    remainingSearches: "Verbleibende Suchen",
    limitReset: "Limit wird zurückgesetzt in",
    unlimited: "Unbegrenzt",
    alreadyPremium: "Bereits Premium?",
    invalidPass: "Ungültiger Token. Bitte überprüfen Sie ihn und versuchen Sie es erneut.",
    apiKeyActive: "API-Schlüssel korrekt konfiguriert",
    apiKeyMissing: "API-Schlüssel nicht konfiguriert",
    apiKeyGuide1: "Holen Sie sich Ihren KOSTENLOSEN Schlüssel bei",
    apiKeyGuide2: "Fügen Sie ihn in den Einstellungen ein (Zahnrad-Symbol ⚙️)",
    apiKeyOr: "oder",
    installApp: "App installieren",
    pasteError: "Zugriff auf die Zwischenablage blockiert. Bitte verwenden Sie Strg+V (oder Cmd+V) zum Einfügen."
  },
  Italian: {
    title: "AntiClickBaitLinks",
    placeholder: "Incolla link",
    summarize: "Rivela Verità",
    realSummary: "La Risposta",
    clear: "Pulisci",
    settingsTitle: "Configurazione API",
    settingsDesc: "Inserisci la tua Gemini API Key per far funzionare l'app. Verrà salvata localmente nel tuo browser.",
    saveBtn: "Salva Configurazione",
    pasteLink: "Incolla link",
    clearLink: "Pulisci",
    noKeyLink: "Non hai una chiave? Ottienila qui gratuitamente",
    invalidUrl: "Inserisci un link valido.",
    genericError: "Non è stato possibile elaborare questo link. Assicurati que sia pubblico e accessibile.",
    noKeyError: "API Key non configurata. Inserisci la tua Gemini API Key nelle impostaciones.",
    quotaError: "Quota superata. Attendi un momento prima di riprovare.",
    uiLang: "Lingua dell'interfaccia",
    apiProvider: "Fornitore API",
    listen: "Ascolta",
    stop: "Ferma",
    expandMedium: "Più dettagli",
    expandLong: "Riassunto completo",
    explainChild: "Spiega a un bambino di 10 anni",
    infoTitle: "Informazioni su AntiClickBaitLinks",
    infoDesc: "AntiClickBaitLinks usa l'IA per svelare la verità dietro i titoli sensazionalistici, evitandoti di cadere nel clickbait. Incolla qualsiasi link e ricevi un riassunto istantaneo.",
    infoHowToTitle: "Come si usa",
    infoStep1Title: "1. Ottieni la tua API Key",
    infoStep1Desc: "Richiedi la tua chiave GRATUITA da Gemini (Google), Cohere o OpenRouter cliccando su uno dei link seguenti.",
    infoStep2Title: "2. Copiala e incollala in AntiClickBaitLinks",
    infoStep2Desc: "Incolla la tua chiave nelle impostazioni (icona ingranaggio). Puoi attivare tutte e 3 le API contemporaneamente per prestazioni migliori.",
    infoApiPrivacyTitle: "La mia API Key è sicura?",
    infoApiPrivacyDesc: "Sì. La tua chiave è memorizzata SOLO nella memoria locale del tuo browser. Non viene mai inviata ai nostri server né condivisa con nessuno.",
    infoLimitsTitle: "Versione Gratuita",
    infoLimitsDesc: "Puoi effettuare 5 riassunti gratuiti ogni 24 ore. Un conto alla rovescia apparirà una volta raggiunto il limite.",
    infoPremiumTitle: "Versione Premium",
    infoPremiumDesc: "Ottieni l'accesso illimitato per sempre e rimuovi tutti i limiti con un unico pagamento.",
    dontShowAgain: "Non mostrare più all'avvio",
    closeBtn: "Chiudi",
    copy: "Copia",
    copied: "Copiato!",
    lockTitle: "Limite Giornaliero Raggiunto",
    lockDesc: "Hai raggiunto il limite di 5 riassunti gratuiti ogni 24 ore. Attendi il reset del limite o sblocca l'app per sempre.",
    unlockPlaceholder: "Incolla qui il tuo token Premium",
    unlockBtn: "Attiva Premium",
    buyBtn: "Compra Premium",
    resetIn: "Reset tra",
    statusFree: "Account Gratuito",
    statusPremium: "Account Premium",
    remainingSearches: "Ricerche rimanenti",
    limitReset: "Il limite si resetta tra",
    unlimited: "Illimitato",
    alreadyPremium: "Già Premium?",
    invalidPass: "Token non valido. Controlla e riprova.",
    apiKeyActive: "API Key configurata correttamente",
    apiKeyMissing: "API Key non configurata",
    apiKeyGuide1: "Ottieni la tua chiave GRATUITA su",
    apiKeyGuide2: "Incollala nelle impostazioni (icona ingranaggio ⚙️)",
    apiKeyOr: "o",
    installApp: "Installa App",
    pasteError: "Accesso agli appunti bloccato. Usa Ctrl+V (o Cmd+V) per incollare."
  }
};

export default function App() {
  const [url, setUrl] = useState('');
  const [uiLanguage, setUiLanguage] = useState('English');
  const [summary, setSummary] = useState<string | null>(null);
  const [articleTitle, setArticleTitle] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // API Key state
  const [userApiKey, setUserApiKey] = useState<string>(''); // current input field
  const [apiKeys, setApiKeys] = useState<ApiKeys>({});
  const [showSettings, setShowSettings] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [isKeySaved, setIsKeySaved] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [searchHistory, setSearchHistory] = useState<number[]>([]);
  const [showLockModal, setShowLockModal] = useState(false);
  const [resetTimestamp, setResetTimestamp] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [unlockPass, setUnlockPass] = useState('');
  const [lockError, setLockError] = useState(false);
  const [provider, setProvider] = useState<Provider>('gemini');
  const [currentLength, setCurrentLength] = useState<'short' | 'medium' | 'long' | 'child'>('short');
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [showApiPrivacy, setShowApiPrivacy] = useState(false);
  const [showStatusPopover, setShowStatusPopover] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [showInstallButton, setShowInstallButton] = useState(false);

  const openPopup = (popup: string) => {
    setShowStatusPopover(popup === 'status');
    setShowLangMenu(popup === 'lang');
    setShowInfo(popup === 'info');
    setShowSettings(popup === 'settings');
    if (popup !== 'info') setShowApiPrivacy(false);
  };

  const togglePopup = (popup: string) => {
    const isCurrentlyOpen = 
      (popup === 'status' && showStatusPopover) ||
      (popup === 'lang' && showLangMenu) ||
      (popup === 'info' && showInfo) ||
      (popup === 'settings' && showSettings);
    
    if (isCurrentlyOpen) {
      openPopup('');
    } else {
      openPopup(popup);
    }
  };

  const openLockModal = () => {
    openPopup('');
    setShowLockModal(true);
  };

  const t = UI_TRANSLATIONS[uiLanguage as keyof typeof UI_TRANSLATIONS] || UI_TRANSLATIONS.English;

  const remainingSearches = isPremium ? Infinity : Math.max(0, 5 - searchHistory.filter(ts => ts > Date.now() - 24 * 60 * 60 * 1000).length);
  const nextResetTime = !isPremium && searchHistory.length > 0 
    ? Math.min(...searchHistory.filter(ts => ts > Date.now() - 24 * 60 * 60 * 1000)) + 24 * 60 * 60 * 1000 
    : null;

  // Stop speaking on unmount
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  // PWA install prompt
  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
      setShowInstallButton(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => setShowInstallButton(false));
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowInstallButton(false);
      setInstallPrompt(null);
    }
  };

  // Load key and UI lang from localStorage on mount
  useEffect(() => {
    const savedProvider = localStorage.getItem('api_provider') as Provider;
    if (savedProvider) {
      setProvider(savedProvider);
    }
    const savedKeys: ApiKeys = {
      gemini: localStorage.getItem('api_key_gemini') || undefined,
      openrouter: localStorage.getItem('api_key_openrouter') || undefined,
      grok: localStorage.getItem('api_key_cohere') || undefined,
    };
    setApiKeys(savedKeys);
    // Load current provider key into input field
    const currentKey = savedKeys[savedProvider || 'gemini'];
    if (currentKey) {
      setUserApiKey(currentKey);
      setIsKeySaved(true);
    }
    const savedUiLang = localStorage.getItem('ui_language');
    if (savedUiLang && UI_TRANSLATIONS[savedUiLang as keyof typeof UI_TRANSLATIONS]) {
      setUiLanguage(savedUiLang);
    }

    // Load usage limit state
    const savedPremium = localStorage.getItem('is_premium') === 'true';
    setIsPremium(savedPremium);
// Verificar que el token guardado sigue siendo válido
if (savedPremium) {
  const savedToken = localStorage.getItem('premium_token');
  if (savedToken) {
    fetch('/api/validate-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: savedToken }),
    })
      .then(r => r.json())
      .then(data => {
        if (!data.valid) {
          // Token revocado o inválido, quitar premium
          setIsPremium(false);
          localStorage.removeItem('is_premium');
          localStorage.removeItem('premium_token');
        }
      })
      .catch(() => {
        // Si falla la red, mantener premium (beneficio de la duda)
      });
  }
}

    // Load onboarding state
    const savedDontShow = localStorage.getItem('dont_show_onboarding') === 'true';
    setDontShowAgain(savedDontShow);
    if (!savedDontShow) {
      setShowInfo(true);
    }
    
    const savedHistory = localStorage.getItem('search_history');
    if (savedHistory) {
      try {
        const history = JSON.parse(savedHistory);
        setSearchHistory(history);
        
        // Check if already locked on load
        const now = Date.now();
        const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
        const recentSearches = history.filter((timestamp: number) => timestamp > twentyFourHoursAgo);
        if (recentSearches.length >= 5 && !savedPremium) {
          const oldestSearch = Math.min(...recentSearches);
          setResetTimestamp(oldestSearch + 24 * 60 * 60 * 1000);
          openLockModal();
        }
      } catch (e) {
        setSearchHistory([]);
      }
    }
  }, []);

  const saveApiKey = () => {
    const newKeys = { ...apiKeys };
    if (userApiKey) {
      newKeys[provider] = userApiKey;
      localStorage.setItem(`api_key_${provider}`, userApiKey);
    } else {
      delete newKeys[provider];
      localStorage.removeItem(`api_key_${provider}`);
    }
    setApiKeys(newKeys);
    localStorage.setItem('api_provider', provider);
    const hasAnyKey = Object.values(newKeys).some(k => k && k !== 'undefined');
    setIsKeySaved(hasAnyKey);
    setShowSettings(false);
  };

  const changeUiLanguage = (lang: string) => {
    setUiLanguage(lang);
    localStorage.setItem('ui_language', lang);
    setShowLangMenu(false);
  };

  const checkUsageLimit = () => {
    if (isPremium) return true;

    const now = Date.now();
    const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
    const recentSearches = searchHistory.filter(timestamp => timestamp > twentyFourHoursAgo);
    
    if (recentSearches.length >= 5) {
      const oldestSearch = Math.min(...recentSearches);
      setResetTimestamp(oldestSearch + 24 * 60 * 60 * 1000);
      openLockModal();
      return false;
    }
    return true;
  };

  // Countdown timer for lock modal
  useEffect(() => {
    if (!showLockModal || !resetTimestamp) return;

    const updateTimer = () => {
      const now = Date.now();
      const diff = resetTimestamp - now;

      if (diff <= 0) {
        setShowLockModal(false);
        setResetTimestamp(null);
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [showLockModal, resetTimestamp]);

const handleUnlock = async () => {
    if (!unlockPass.trim()) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/validate-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: unlockPass.trim() }),
      });
      const data = await res.json();

      if (data.valid) {
        setIsPremium(true);
        localStorage.setItem('is_premium', 'true');
        localStorage.setItem('premium_token', unlockPass.trim());
        setShowLockModal(false);
        openPopup('');
        setLockError(false);
        setUnlockPass('');
      } else {
        setLockError(true);
      }
    } catch {
      setLockError(true);
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-summarize when a valid URL is pasted
  useEffect(() => {
    const timer = setTimeout(() => {
      if (url && !isLoading && !summary) {
        try {
          new URL(url);
          handleSummarize();
        } catch {
          // Not a valid URL yet, ignore
        }
      }
    }, 500); // Small debounce to wait for paste completion

    return () => clearTimeout(timer);
  }, [url]);

  // Scroll to results when summary appears
  useEffect(() => {
    if (summary && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [summary]);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text);
        setError(null);
      }
    } catch (err) {
      console.error('Failed to read clipboard: ', err);
      setError(t.pasteError);
      setTimeout(() => setError(null), 5000);
    }
  };

  const handleClear = () => {
    setUrl('');
    setSummary(null);
    setArticleTitle(null);
    setError(null);
  };

  const handleSummarize = async (e?: React.FormEvent, length: 'short' | 'medium' | 'long' | 'child' = 'short') => {
    if (e) e.preventDefault();
    if (!url || isLoading) return;

    // Check usage limit
    if (!checkUsageLimit()) return;

    // Stop any ongoing speech
    window.speechSynthesis.cancel();
    setIsSpeaking(false);

    // Basic URL validation
    try {
      new URL(url);
    } catch {
      setError(t.invalidUrl);
      return;
    }

    setIsLoading(true);
    setError(null);
    setCurrentLength(length);
    
    // If it's a new URL, clear the previous summary
    // If it's just an expansion, we might want to keep it or show loading
    if (length === 'short') {
      setSummary(null);
      setArticleTitle(null);
    }

    try {
      const result = await summarizeUrl(url, uiLanguage, apiKeys, length, provider);
      setSummary(result);
      // Fetch page title
      if (length === 'short') {
        try {
          const titleRes = await fetch('/api/fetch-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
          });
          if (titleRes.ok) {
            const { title } = await titleRes.json();
            if (title) setArticleTitle(title);
          }
        } catch { /* ignore */ }
      }
      
      // Update search history on success
      if (!isPremium) {
        const newHistory = [...searchHistory, Date.now()];
        setSearchHistory(newHistory);
        localStorage.setItem('search_history', JSON.stringify(newHistory));
      }
    } catch (err: any) {
      let message = t.genericError;
      
      // Handle Quota Exceeded (429)
      if (err.message === 'quota_exceeded_all' || err.message?.includes('429') || err.message?.includes('RESOURCE_EXHAUSTED') || err.message?.includes('Quota exceeded')) {
        message = t.quotaError;
        
        // Try to extract retry delay if present
        try {
          const errorObj = JSON.parse(err.message.substring(err.message.indexOf('{')));
          if (errorObj.error?.details) {
            const retryInfo = errorObj.error.details.find((d: any) => d['@type']?.includes('RetryInfo'));
            if (retryInfo?.retryDelay) {
              message += ` (Retry in ${retryInfo.retryDelay})`;
            }
          }
        } catch (e) {
          // Fallback to generic quota message
        }
      } else if (err.message?.includes('API Key')) {
        message = t.noKeyError;
        openPopup('settings');
      }
      
      setError(message);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSpeak = () => {
    if (!summary) return;

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(summary);
    
    // Map target language to BCP 47 tags
    const langMap: Record<string, string> = {
      'Spanish': 'es-ES',
      'English': 'en-US',
      'Portuguese': 'pt-BR',
      'French': 'fr-FR',
      'German': 'de-DE',
      'Italian': 'it-IT'
    };
    
    utterance.lang = langMap[uiLanguage] || 'en-US';
    
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const handleCopy = async () => {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(summary);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-start pt-36 sm:justify-center sm:pt-0 p-6 sm:p-12">
      {/* Background Decoration */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-white via-white to-emerald-100" />
        <div className="absolute bottom-0 left-0 w-full h-[50%] bg-gradient-to-t from-emerald-200/70 via-emerald-100/40 to-transparent" />
        <div className="absolute -bottom-[20%] -left-[10%] w-[50%] h-[50%] bg-emerald-300/25 rounded-full blur-3xl" />
        <div className="absolute -bottom-[10%] right-[5%] w-[35%] h-[35%] bg-teal-200/25 rounded-full blur-3xl" />
      </div>

      {/* Top Bar Controls */}
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2">
        {/* Account Status Indicator */}
          <button
            onClick={() => togglePopup('status')}
            className={cn(
              "px-4 py-3 rounded-2xl transition-all shadow-lg flex items-center gap-2 font-bold text-xs uppercase tracking-wider",
              isPremium 
                ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white" 
                : "bg-white text-zinc-600 hover:bg-zinc-50 border border-zinc-100"
            )}
          >
            {isPremium ? (
              <>
                <ShieldCheck size={16} />
                <span className="hidden sm:inline">{t.statusPremium}</span>
              </>
            ) : (
              <>
                <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span className="hidden sm:inline">{t.statusFree}</span>
                <span className="bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded-md text-[10px]">{remainingSearches}/5</span>
              </>
            )}
          </button>


        {/* Language Selector */}
          <button
            onClick={() => togglePopup('lang')}
            className={cn(
              "p-3 rounded-2xl transition-all shadow-lg flex items-center gap-2",
              showLangMenu ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 hover:bg-zinc-50"
            )}
          >
            <Languages size={20} />
            <span className="text-sm font-bold hidden sm:inline">
              {LANGUAGES.find(l => l.code === uiLanguage)?.flag}
            </span>
          </button>


        {/* Info Toggle */}
        <button
          onClick={() => togglePopup('info')}
          className={cn(
            "p-3 rounded-2xl transition-all shadow-lg flex items-center gap-2",
            showInfo ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 hover:bg-zinc-50"
          )}
        >
          <Info size={20} />
        </button>

        {/* Settings Toggle */}
        <button
          onClick={() => togglePopup('settings')}
          className={cn(
            "p-3 rounded-2xl transition-all shadow-lg flex items-center gap-2",
            showSettings ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 hover:bg-zinc-50"
          )}
        >
          {isKeySaved ? <Check size={20} className="text-emerald-500" /> : <Key size={20} />}
          <Settings size={20} className={cn(showSettings && "animate-spin-slow")} />
        </button>

      </div>

      {/* Status Popover */}
      <AnimatePresence>
        {showStatusPopover && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[45]" onClick={() => setShowStatusPopover(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-xs glass rounded-2xl p-4 shadow-2xl space-y-3 z-[46]"
            >
              <div className="flex items-center justify-between">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  {isPremium ? t.statusPremium : t.statusFree}
                </h4>
                <button onClick={() => setShowStatusPopover(false)} className="text-zinc-400 hover:text-zinc-600">
                  <X size={14} />
                </button>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center bg-zinc-50/50 p-2 rounded-xl border border-zinc-100">
                  <span className="text-xs text-zinc-500">{t.remainingSearches}</span>
                  <span className="text-sm font-bold text-zinc-900">
                    {isPremium ? t.unlimited : `${remainingSearches}/5`}
                  </span>
                </div>
                {!isPremium && nextResetTime && (
                  <div className="flex justify-between items-center bg-red-50/50 p-2 rounded-xl border border-red-100">
                    <span className="text-xs text-red-500">{t.limitReset}</span>
                    <span className="text-sm font-bold text-red-600 font-mono">
                      {timeLeft || "--:--:--"}
                    </span>
                  </div>
                )}
              </div>
              {!isPremium && (
                <button
                  onClick={() => openLockModal()}
                  className="w-full py-2 bg-emerald-500 text-white rounded-xl text-xs font-bold hover:bg-emerald-600 transition-all active:scale-[0.98]"
                >
                  {t.buyBtn}
                </button>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Language Menu */}
      <AnimatePresence>
        {showLangMenu && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[45]" onClick={() => setShowLangMenu(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-xs glass rounded-2xl p-4 shadow-2xl space-y-1 z-[46]"
            >
              <p className="px-1 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">{t.uiLang}</p>
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => changeUiLanguage(lang.code)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors",
                    uiLanguage === lang.code ? "bg-emerald-50 text-emerald-700 font-bold" : "text-zinc-600 hover:bg-zinc-50"
                  )}
                >
                  <span>{lang.flag}</span>
                  <span>{lang.name}</span>
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Lock Modal */}
      <AnimatePresence>
        {showLockModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-zinc-900/80 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-md bg-white rounded-[2.5rem] p-8 shadow-2xl space-y-6 relative overflow-hidden"
            >
              {/* Decorative background for modal */}
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-emerald-500 via-blue-500 to-purple-500" />
              
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="w-20 h-20 rounded-3xl bg-red-50 text-red-500 flex items-center justify-center shadow-inner">
                  <Lock size={40} />
                </div>
                <h2 className="text-2xl font-bold text-zinc-900">{t.lockTitle}</h2>
                <p className="text-zinc-500 leading-relaxed">
                  {t.lockDesc}
                </p>
                {timeLeft && (
                  <div className="px-4 py-2 bg-red-50 text-red-600 rounded-xl font-mono font-bold text-sm flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wider opacity-70">{t.resetIn}</span>
                    {timeLeft}
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <a 
                  href="https://www.paypal.com/ncp/payment/SD8UXPABAFFJL"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-4 bg-emerald-500 text-white rounded-2xl font-bold hover:bg-emerald-600 transition-all active:scale-[0.98] shadow-xl flex items-center justify-center gap-2"
                >
                  {t.buyBtn} <ArrowRight size={18} />
                </a>

                <div className="space-y-2">
                  <div className="relative">
                    <input
                      type="password"
                      placeholder={t.unlockPlaceholder}
                      value={unlockPass}
                      onChange={(e) => {
                        setUnlockPass(e.target.value);
                        setLockError(false);
                      }}
                      className={cn(
                        "w-full px-6 py-4 bg-zinc-100 rounded-2xl outline-none transition-all text-center font-mono tracking-widest",
                        lockError ? "ring-2 ring-red-500/20 border-red-500" : "focus:ring-2 focus:ring-emerald-500/20"
                      )}
                    />
                    {lockError && (
                      <p className="text-[10px] text-red-500 font-bold text-center mt-2 uppercase tracking-wider">
                        {t.invalidPass}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={handleUnlock}
                    className="w-full py-4 bg-zinc-900 text-white rounded-2xl font-bold hover:bg-zinc-800 transition-all active:scale-[0.98] shadow-xl"
                  >
                    {t.unlockBtn}
                  </button>
                </div>
              </div>

              <button 
                onClick={() => setShowLockModal(false)}
                className="w-full py-2 text-zinc-400 hover:text-zinc-600 text-sm font-medium transition-colors"
              >
                {t.clear}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Info Panel / Onboarding */}
      <AnimatePresence>
        {showInfo && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[45]" onClick={() => { setShowInfo(false); setDontShowAgain(true); localStorage.setItem('dont_show_onboarding', 'true'); }} />
            <motion.div
              initial={dontShowAgain ? { opacity: 0, y: -20, scale: 0.95 } : { opacity: 0, scale: 0.9, y: 20 }}
              animate={dontShowAgain ? { opacity: 1, y: 0, scale: 1 } : { opacity: 1, scale: 1, y: 0 }}
              exit={dontShowAgain ? { opacity: 0, y: -20, scale: 0.95 } : { opacity: 0, scale: 0.9, y: 20 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[46] w-[90%] max-w-md glass rounded-3xl p-6 shadow-2xl space-y-5 max-h-[85vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between pb-2">
                <h3 className="font-bold text-zinc-900 flex items-center gap-2">
                  <Info size={18} /> {t.infoTitle}
                </h3>
                <button onClick={() => setShowInfo(false)} className="text-zinc-400 hover:text-zinc-600">
                  <X size={20} />
                </button>
              </div>
              
              <div className="space-y-5">
                <section>
                  <p className="text-sm text-zinc-600 leading-relaxed">{t.infoDesc}</p>
                </section>
                <section className="space-y-3">
                  <h4 className="text-sm font-extrabold text-zinc-800">{t.infoHowToTitle}</h4>
                  
                  <div className="space-y-4">
                    <div className="flex gap-3">
                      <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs font-bold shrink-0">1</div>
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-zinc-800">{t.infoStep1Title}</p>
                        <p className="text-xs text-zinc-500 leading-relaxed">{t.infoStep1Desc}</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-[10px] bg-zinc-100 px-2 py-1 rounded-md hover:bg-zinc-200 transition-colors">Gemini</a>
                          <a href="https://dashboard.cohere.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-[10px] bg-zinc-100 px-2 py-1 rounded-md hover:bg-zinc-200 transition-colors">Cohere</a>
                          <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-[10px] bg-zinc-100 px-2 py-1 rounded-md hover:bg-zinc-200 transition-colors">OpenRouter</a>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs font-bold shrink-0">2</div>
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-zinc-800">{t.infoStep2Title}</p>
                        <p className="text-xs text-zinc-500 leading-relaxed">{t.infoStep2Desc}</p>
                        
                        <button 
                          onClick={() => setShowApiPrivacy(!showApiPrivacy)}
                          className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 hover:text-emerald-700 transition-colors mt-2"
                        >
                          <ShieldCheck size={12} /> {t.infoApiPrivacyTitle}
                        </button>
                        
                        <AnimatePresence>
                          {showApiPrivacy && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <p className="text-[10px] text-zinc-500 bg-emerald-50/50 p-2 rounded-lg mt-1 border border-emerald-100">
                                {t.infoApiPrivacyDesc}
                              </p>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="space-y-2">
                  <h4 className="text-sm font-extrabold text-zinc-800">{t.infoLimitsTitle}</h4>
                  <p className="text-sm text-zinc-600 leading-relaxed">
                    {t.infoLimitsDesc}
                  </p>
                </section>

                <section className="space-y-3">
                  <h4 className="text-sm font-extrabold text-zinc-800">{t.infoPremiumTitle}</h4>
                  <p className="text-sm text-zinc-600 leading-relaxed">
                    {t.infoPremiumDesc}
                  </p>
                  <a 
                    href="https://www.paypal.com/ncp/payment/SD8UXPABAFFJL"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-3 bg-emerald-500 text-white rounded-xl font-bold hover:bg-emerald-600 transition-all active:scale-[0.98] shadow-lg flex items-center justify-center gap-2 text-sm"
                  >
                    {t.buyBtn} <ArrowRight size={16} />
                  </a>

                  {!isPremium && (
                    <div className="mt-4 pt-4 border-t border-zinc-100 space-y-3">
                      <h5 className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{t.alreadyPremium}</h5>
                      <div className="flex gap-2">
                        <input
                          type="password"
                          placeholder={t.unlockPlaceholder}
                          value={unlockPass}
                          onChange={(e) => {
                            setUnlockPass(e.target.value);
                            setLockError(false);
                          }}
                          className={cn(
                            "flex-1 px-3 py-2 bg-zinc-100 rounded-xl outline-none transition-all text-xs font-mono",
                            lockError ? "ring-1 ring-red-500 border-red-500" : "focus:ring-1 focus:ring-emerald-500"
                          )}
                        />
                        <button
                          onClick={handleUnlock}
                          className="px-4 py-2 bg-zinc-900 text-white rounded-xl text-xs font-bold hover:bg-zinc-800 transition-all active:scale-[0.95]"
                        >
                          {t.unlockBtn}
                        </button>
                      </div>
                      {lockError && (
                        <p className="text-[9px] text-red-500 font-bold uppercase tracking-wider">
                          {t.invalidPass}
                        </p>
                      )}
                    </div>
                  )}
                </section>

                <div className="pt-4 border-t border-zinc-100 space-y-4">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div className="relative flex items-center">
                      <input
                        type="checkbox"
                        checked={dontShowAgain}
                        onChange={(e) => {
                          const val = e.target.checked;
                          setDontShowAgain(val);
                          localStorage.setItem('dont_show_onboarding', val.toString());
                        }}
                        className="peer sr-only"
                      />
                      <div className="w-5 h-5 border-2 border-zinc-200 rounded-md transition-all peer-checked:bg-emerald-500 peer-checked:border-emerald-500 group-hover:border-emerald-300" />
                      <Check size={14} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 transition-opacity peer-checked:opacity-100" />
                    </div>
                    <span className="text-xs text-zinc-500 font-medium group-hover:text-zinc-700 transition-colors">
                      {t.dontShowAgain}
                    </span>
                  </label>

                  <button
                    onClick={() => {
                      setShowInfo(false);
                      setDontShowAgain(true);
                      localStorage.setItem('dont_show_onboarding', 'true');
                    }}
                    className="w-full py-3 bg-zinc-900 text-white rounded-xl font-bold hover:bg-zinc-800 transition-all active:scale-[0.98]"
                  >
                    {t.closeBtn}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Settings Panel */}
      <AnimatePresence>
        {showSettings && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[45]" onClick={() => setShowSettings(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[46] w-[90%] max-w-sm glass rounded-3xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
            >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-zinc-900 flex items-center gap-2">
                <Key size={18} /> {t.settingsTitle}
              </h3>
              <button onClick={() => setShowSettings(false)} className="text-zinc-400 hover:text-zinc-600">
                <X size={20} />
              </button>
            </div>
            <p className="text-xs text-zinc-500">
              {t.settingsDesc}
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-2">
                  {t.apiProvider}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['gemini', 'openrouter', 'cohere'] as Provider[]).map((p) => (
                    <button
                      key={p}
                      onClick={() => { setProvider(p); setUserApiKey(apiKeys[p] || ''); }}
                      className={cn(
                        "px-2 py-2 text-[10px] font-bold rounded-lg border transition-all",
                        provider === p 
                          ? "bg-emerald-600 border-emerald-600 text-white shadow-sm" 
                          : "bg-white border-zinc-200 text-zinc-600 hover:border-emerald-200"
                      )}
                    >
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <input
                  type="password"
                  placeholder={provider === 'gemini' ? "AIzaSy..." : provider === 'cohere' ? "Cohere key..." : "sk-or-..."}
                  value={userApiKey}
                  onChange={(e) => setUserApiKey(e.target.value)}
                  className="w-full px-4 py-3 bg-zinc-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
                />
                <button
                  onClick={saveApiKey}
                  className="w-full py-3 bg-emerald-600 text-white rounded-xl font-semibold text-sm hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100"
                >
                  {t.saveBtn}
                </button>
              </div>
            </div>
            <a 
              href={
                provider === 'gemini' ? "https://aistudio.google.com/app/apikey" :
                provider === 'openrouter' ? "https://openrouter.ai/keys" :
                "https://dashboard.cohere.com/api-keys"
              }
              target="_blank" 
              rel="noopener noreferrer"
              className="block text-center text-[10px] text-emerald-600 hover:underline"
            >
              {t.noKeyLink}
            </a>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl space-y-6 sm:space-y-8"
      >
        {/* Header */}
        <div className="text-center space-y-2 sm:space-y-4">
          <div className={cn(
            "inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-200 transition-all duration-500",
            isLoading && "animate-pulse scale-110 shadow-emerald-400"
          )}>
            <ShieldCheck size={32} />
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-zinc-900">
            {t.title}
          </h1>
        </div>

        {/* Main Form */}
        <div className="glass rounded-3xl p-2 sm:p-3 shadow-xl">
          <form onSubmit={handleSummarize} className="flex items-center gap-2">
            <div className="relative flex-1">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400">
                <LinkIcon size={20} />
              </div>
              <input
                type="text"
                placeholder={t.placeholder}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full pl-12 pr-32 py-4 bg-transparent border-none focus:ring-0 text-zinc-900 placeholder:text-zinc-400 text-lg outline-none"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {url && !isLoading && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-all active:scale-90"
                    title={t.clearLink}
                  >
                    <X size={20} />
                  </button>
                )}
                {!url && !isLoading && (
                  <button 
                    type="button"
                    onClick={handlePaste}
                    className="flex items-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-all active:scale-95 whitespace-nowrap"
                  >
                    <Clipboard size={14} />
                    {t.pasteLink}
                  </button>
                )}
                {isLoading && (
                  <div className="p-2">
                    <Loader2 className="animate-spin text-emerald-600" size={24} />
                  </div>
                )}
              </div>
            </div>
          </form>
        </div>

        {/* API Key Status Indicator */}
        {(() => {
          const hasAnyKey = Object.values(apiKeys).some(k => k && k !== 'undefined');
          return (
            <div className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium",
              hasAnyKey
                ? "bg-emerald-50 text-emerald-700"
                : "bg-amber-50 text-amber-700"
            )}>
              {hasAnyKey ? (
                <>
                  <Check size={14} className="shrink-0" />
                  <span>{Object.entries(apiKeys).filter(([,v]) => v && v !== 'undefined').map(([k]) => k.charAt(0).toUpperCase() + k.slice(1)).join(' · ')} — {t.apiKeyActive}</span>
                </>
              ) : (
                <div className="w-full space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle size={14} className="shrink-0" />
                    <span>{t.apiKeyMissing}</span>
                  </div>
                  <div className="text-[10px] text-amber-600 space-y-1 pl-5">
                    <p>1. {t.apiKeyGuide1} <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="underline font-bold">Gemini</a>, <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="underline font-bold">OpenRouter</a> {t.apiKeyOr} <a href="https://dashboard.cohere.com/api-keys" target="_blank" rel="noopener noreferrer" className="underline font-bold">Cohere</a></p>
                    <p>2. {t.apiKeyGuide2}</p>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Results Area */}
        <div ref={resultsRef}>
          <AnimatePresence mode="wait">
            {error && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="p-4 rounded-2xl bg-red-50 border border-red-100 text-red-600 flex items-center gap-3"
            >
              <AlertCircle size={20} />
              <p className="font-medium">{error}</p>
            </motion.div>
          )}

          {summary && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="glass rounded-3xl p-8 space-y-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">
                    {t.realSummary}
                  </span>
                  <button
                    onClick={handleSpeak}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all",
                      isSpeaking 
                        ? "bg-red-50 text-red-600 hover:bg-red-100" 
                        : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                    )}
                  >
                    {isSpeaking ? <VolumeX size={14} /> : <Volume2 size={14} />}
                    {isSpeaking ? t.stop : t.listen}
                  </button>
                  <button
                    onClick={handleCopy}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all",
                      isCopied 
                        ? "bg-emerald-100 text-emerald-700" 
                        : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                    )}
                  >
                    {isCopied ? <CopyCheck size={14} /> : <Copy size={14} />}
                    {isCopied ? t.copied : t.copy}
                  </button>
                </div>
                <button 
                  onClick={() => {
                    setSummary(null);
                    setArticleTitle(null);
                    setUrl('');
                    window.speechSynthesis.cancel();
                    setIsSpeaking(false);
                  }}
                  className="text-zinc-400 hover:text-zinc-600 transition-colors"
                >
                  {t.clear}
                </button>
              </div>
              {articleTitle && (
                <div className="pb-3 border-b border-zinc-100">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-1">Original headline</p>
                  <p className="text-sm font-semibold text-zinc-600 leading-snug italic">"{articleTitle}"</p>
                </div>
              )}
              <div className="relative">
                {isLoading && currentLength !== 'short' && (
                  <div className="absolute inset-0 bg-white/50 backdrop-blur-[2px] z-10 flex items-center justify-center rounded-xl">
                    <Loader2 className="animate-spin text-emerald-600" size={32} />
                  </div>
                )}
                <div className="text-lg sm:text-xl font-normal leading-relaxed text-zinc-700 space-y-3">
                  {summary.split('\n').filter(p => p.trim()).map((paragraph, i) => (
                    <p key={i}>{paragraph}</p>
                  ))}
                </div>
              </div>

              {/* Expansion Buttons */}
              <div className="flex flex-wrap gap-2 pt-2">
                {currentLength !== 'medium' && (
                  <button
                    onClick={() => handleSummarize(undefined, 'medium')}
                    disabled={isLoading}
                    className="px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-sm font-bold hover:bg-emerald-100 transition-colors disabled:opacity-50"
                  >
                    {t.expandMedium}
                  </button>
                )}
                {currentLength !== 'long' && (
                  <button
                    onClick={() => handleSummarize(undefined, 'long')}
                    disabled={isLoading}
                    className="px-4 py-2 bg-blue-50 text-blue-700 rounded-xl text-sm font-bold hover:bg-blue-100 transition-colors disabled:opacity-50"
                  >
                    {t.expandLong}
                  </button>
                )}
                {currentLength !== 'child' && (
                  <button
                    onClick={() => handleSummarize(undefined, 'child')}
                    disabled={isLoading}
                    className="px-4 py-2 bg-purple-50 text-purple-700 rounded-xl text-sm font-bold hover:bg-purple-100 transition-colors disabled:opacity-50"
                  >
                    {t.explainChild}
                  </button>
                )}
              </div>

              <div className="pt-4 border-t border-zinc-100 flex items-center gap-2 text-zinc-400 text-sm">
                <Search size={14} />
                <span className="truncate max-w-[250px] sm:max-w-md">{url}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Install App Button */}
      <AnimatePresence>
        {showInstallButton && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="w-full max-w-2xl"
          >
            <button
              onClick={handleInstall}
              className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white rounded-2xl shadow-lg font-bold text-sm hover:bg-emerald-700 transition-all active:scale-[0.98]"
            >
              <Download size={18} />
              {t.installApp}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
    </div>
  );
}
