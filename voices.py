"""Voice and language catalog for the claims agent.

The voice is the only language setting: every voice belongs to exactly one
language, and choosing it chooses the listen model and the language the agent
replies in. There is no separate language setting that could disagree with it.

Only languages that Deepgram's flux-general-multi listen model can hear are
offered. A voice in a language the agent can't understand is a voice nobody
can talk back to.

Voices come from https://developers.deepgram.com/docs/flux-tts/voices
"""

import random
import re
import unicodedata
from dataclasses import dataclass

from pipecat.transcriptions.language import Language as PipecatLanguage


@dataclass(frozen=True)
class Language:
    code: str  # ISO code: the model suffix and the Flux language hint
    name: str  # used in the prompt and tool text
    # Hold lines, one spoken when a claim lookup runs long. Written in the
    # language itself, since the voice would otherwise read the English text
    # with a foreign accent. Each is neutral about the speaker's gender, since
    # any voice in the language may say it.
    fillers: tuple[str, ...]
    # Said when the caller has gone quiet: a check-in first, then a goodbye
    # before the agent hangs up. Short, so they don't fill the silence they're
    # asking about, and in the language for the same reason as the fillers.
    still_there: str
    goodbye: str


@dataclass(frozen=True)
class Voice:
    name: str  # the short name the model chooses by
    model: str  # the Flux TTS model id sent to Deepgram
    blurb: str  # e.g. "Spanish woman"
    lang: str  # a code from LANGUAGES
    featured: bool = False  # named in the set_voice description


LANGUAGES: dict[str, Language] = {
    lang.code: lang
    for lang in [
        Language("en", "English", (
            "Let me look that up for you.",
            "One moment while I pull that up.",
            "Sure, checking on that now.",
            "Give me just a second.",
            "Bear with me one moment.",
        ),
            still_there="Are you still there?",
            goodbye="I haven't heard from you, so I'll end the call here. Call back anytime. Take care!",
        ),
        Language("es", "Spanish", (
            "Permítame buscarlo, un momento, por favor.",
            "Un momento, lo estoy consultando.",
            "Déjeme revisarlo.",
            "Enseguida lo verifico.",
        ),
            still_there="¿Sigue ahí?",
            goodbye="Como no le escucho, voy a terminar la llamada. Puede volver a llamar cuando quiera. ¡Hasta luego!",
        ),
        Language("fr", "French", (
            "Je vérifie cela pour vous, un instant, s'il vous plaît.",
            "Un instant, je regarde.",
            "Laissez-moi vérifier.",
            "Je consulte le dossier, un moment.",
        ),
            still_there="Vous êtes toujours là ?",
            goodbye="Je ne vous entends plus, je vais donc raccrocher. N'hésitez pas à rappeler. Au revoir !",
        ),
        Language("de", "German", (
            "Ich sehe das für Sie nach, einen Moment bitte.",
            "Einen Augenblick, ich schaue nach.",
            "Moment, ich prüfe das kurz.",
            "Ich rufe das gleich auf.",
        ),
            still_there="Sind Sie noch da?",
            goodbye="Ich höre Sie leider nicht mehr, deshalb beende ich das Gespräch. Rufen Sie gern jederzeit wieder an. Auf Wiederhören!",
        ),
        Language("hi", "Hindi", (
            "कृपया एक क्षण रुकिए, जानकारी देखी जा रही है।",
            "बस एक क्षण दीजिए।",
            "ज़रा रुकिए, विवरण निकाला जा रहा है।",
            "जी, अभी जाँच की जा रही है।",
        ),
            still_there="क्या आप अभी भी लाइन पर हैं?",
            goodbye="आपकी आवाज़ नहीं आ रही है, इसलिए कॉल समाप्त की जा रही है। आप कभी भी दोबारा कॉल कर सकते हैं। नमस्ते!",
        ),
        Language("ru", "Russian", (
            "Сейчас посмотрю, одну секунду, пожалуйста.",
            "Минутку, проверяю.",
            "Одну секунду, уточняю.",
            "Сейчас проверю для вас.",
        ),
            still_there="Вы ещё на линии?",
            goodbye="Вас не слышно, поэтому завершаю звонок. Звоните в любое время. До свидания!",
        ),
        Language("pt", "Portuguese", (
            "Vou verificar isso, um momento, por favor.",
            "Só um instante, estou verificando.",
            "Deixe-me consultar.",
            "Um momento, vou conferir.",
        ),
            still_there="Ainda está aí?",
            goodbye="Como não há resposta, vou encerrar a chamada. Pode ligar novamente quando quiser. Até logo!",
        ),
        Language("it", "Italian", (
            "Controllo subito, un momento, per favore.",
            "Un attimo, verifico.",
            "Mi lasci controllare.",
            "Un istante, sto cercando.",
        ),
            still_there="È ancora lì?",
            goodbye="Non La sento più, quindi chiudo la chiamata. Può richiamare quando vuole. Arrivederci!",
        ),
        Language("nl", "Dutch", (
            "Ik zoek het even voor u op, een moment alstublieft.",
            "Een ogenblikje, ik kijk het na.",
            "Momentje, ik controleer het even.",
            "Ik zoek het meteen op.",
        ),
            still_there="Bent u er nog?",
            goodbye="Ik hoor u niet meer, dus ik beëindig het gesprek. Bel gerust terug wanneer het u uitkomt. Tot ziens!",
        ),
    ]
}  # fmt: skip

# Featured voices are named in the set_voice description; the rest are only
# reachable through list_voices, which keeps the tool definitions small.
FEATURED = {
    "brooke", "alexis", "kit", "cliff", "colin", "miles",  # English
    "carmen", "camille", "janine", "anjali", "natalia",
    "bianca", "chiara", "anouk",
}  # fmt: skip

# (language code, blurb, short names)
_CATALOG: list[tuple[str, str, str]] = [
    ("en", "American woman", "hannah alexis sienna brooke haley heather bree brittany elise kelsey meghan paige"),
    ("en", "American man", "cliff cole miles bruce donovan drew marcus wade wes"),
    ("en", "British woman", "gemma"),
    ("en", "British man", "kit colin sean conor jack rufus tanner"),
    ("en", "Irish woman", "maeve"),
    ("en", "Australian woman", "sharon"),
    ("en", "Indian woman", "meena priya"),
    ("en", "Indian man", "naveen"),
    ("en", "Singaporean man", "kai"),
    ("en", "Filipino man", "marcelo"),
    ("es", "Spanish woman", "aina carmen cecilia fernanda fiorella patricia pilar valentina ysabel"),
    ("es", "Spanish man", "alfredo duvan eduardo ernesto gustavo jaime martin mauricio rafael tomas"),
    ("fr", "French woman", "brigitte camille chloe veronique yasmine"),
    ("fr", "French man", "arnaud benoit florian julien mathieu pierre thierry"),
    ("de", "German woman", "janine magdalena nadine sonja verena"),
    ("de", "German man", "benjamin christian moritz rolf sven tobias"),
    ("de", "Swiss German woman", "leonie"),
    ("de", "Swiss German man", "yannick"),
    ("hi", "Hindi woman", "anjali divya jyoti pallavi prachi ritu shreya sunita"),
    ("hi", "Hindi man", "ajay arjun nikhil rahul rajesh vikram"),
    ("ru", "Russian woman", "natalia olga polina"),
    ("ru", "Russian man", "andrei kirill maxim mikhail nikolai vladimir"),
    ("pt", "Brazilian Portuguese woman", "bianca claudia marcia mariana marta"),
    ("pt", "Brazilian Portuguese man", "bruno leandro mateus miguel renato roberto rodrigo"),
    ("pt", "European Portuguese woman", "benedita catarina"),
    ("pt", "European Portuguese man", "artur hugo pedro ricardo"),
    ("it", "Italian woman", "angela chiara paola sofia"),
    ("it", "Italian man", "federico giorgio matteo rocco stefano vincenzo vito"),
    ("nl", "Dutch woman", "anouk fleur irene monique sanne yvonne"),
    ("nl", "Dutch man", "bram luuk ruben"),
    ("nl", "Flemish woman", "lotte veerle"),
    ("nl", "Flemish man", "dirk niels"),
]  # fmt: skip

VOICES: list[Voice] = [
    Voice(name, f"flux-{name}-{code}", blurb, code, name in FEATURED)
    for code, blurb, names in _CATALOG
    for name in names.split()
]

# Lookup accepts either the short name or the model id, so both must be unique
_BY_KEY: dict[str, Voice] = {
    key: voice for voice in VOICES for key in (voice.name, voice.model)
}

DEFAULT_VOICE: Voice = _BY_KEY["brooke"]


def ascii_fold(text: str) -> str:
    """Lowercase text with accents removed: "Véronique" becomes "veronique".

    Letters outside the Latin alphabet, such as Cyrillic or Devanagari, are
    left as they are, so they never match a Latin catalog name or record.
    """
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(c for c in decomposed if not unicodedata.combining(c)).lower()


def find_voice(name_or_model: str) -> Voice | None:
    """Find a voice by short name or model id, ignoring case, accents and spaces.

    Transcripts sometimes wrap the name, as in "Voice Kit" or "Kit, please",
    and the model passes that on as is. When there's no exact match, a single
    word that names a voice is accepted.
    """
    key = ascii_fold(name_or_model).strip()
    if key in _BY_KEY:
        return _BY_KEY[key]
    matches = {_BY_KEY[w] for w in re.findall(r"[a-z]+", key) if w in _BY_KEY}
    return matches.pop() if len(matches) == 1 else None


def language_of(voice: Voice) -> Language:
    return LANGUAGES[voice.lang]


def pick_filler(voice: Voice, last: str | None = None) -> str:
    """A hold line in the voice's language, never the one spoken last."""
    fillers = language_of(voice).fillers
    return random.choice([line for line in fillers if line != last] or fillers)


def still_there(voice: Voice) -> str:
    """The check-in after the caller has gone quiet, in the voice's language."""
    return language_of(voice).still_there


def goodbye(voice: Voice) -> str:
    """The last line before hanging up on a quiet caller, in the voice's language."""
    return language_of(voice).goodbye


def voices_for(code: str) -> list[Voice]:
    return [voice for voice in VOICES if voice.lang == code]


def language_line(voice: Voice) -> str:
    """The prompt line that keeps replies in the voice's language.

    Measured on the ESP32 project: without it, English sessions answered
    "Can you speak X?" in X without switching voice; the softer "unless asked
    otherwise" wording missed language changes.
    """
    name = language_of(voice).name
    return f"Reply only in {name}; for any other language, call set_voice first."


def voice_intro(voice: Voice) -> str:
    """The prompt sentence naming the current voice, then the language line."""
    return f"Your voice is {voice.name.title()}, {article(voice.blurb)} {voice.blurb}. {language_line(voice)}"


def article(word: str) -> str:
    """ "a" or "an", by sound: "an Italian", but "a European"."""
    lower = word.lower()
    if lower.startswith(("eu", "uni", "one")):
        return "a"
    return "an" if lower[:1] in "aeiou" else "a"


def listen_settings(voice: Voice) -> dict:
    """Flux listen settings for the voice's language.

    English listens with flux-general-en. Every other language listens with
    flux-general-multi, hinted toward that language and English, so
    "switch back to English" is still heard.
    """
    if voice.lang == "en":
        return {"model": "flux-general-en", "language_hints": None}
    return {
        "model": "flux-general-multi",
        "language_hints": [PipecatLanguage(voice.lang), PipecatLanguage.EN],
    }


def listen_steps(old: Voice, new: Voice) -> list[dict]:
    """The STT settings changes for a switch, in the order to apply them.

    Language hints go to Flux as a Configure message on the open connection,
    and only flux-general-multi accepts them. A model change reconnects. So
    hints are cleared before leaving multi, and set after arriving on it, and
    a Configure never reaches a flux-general-en connection.
    """
    before, after = listen_settings(old), listen_settings(new)
    if before == after:
        return []
    hints = {"language_hints": after["language_hints"]}
    if before["model"] == after["model"]:
        return [hints]  # one multi language to another: no reconnect
    model = {"model": after["model"]}
    if after["model"] == "flux-general-en":
        return [hints, model]  # clear hints on multi, then reconnect
    return [model, hints]  # reconnect to multi, then set hints


def set_voice_description() -> str:
    featured = [v for v in VOICES if v.featured]
    english = ", ".join(v.name for v in featured if v.lang == "en")
    others = ", ".join(
        f"{language_of(v).name} ({v.name})" for v in featured if v.lang != "en"
    )
    return (
        "Change your voice, and with it your language. "
        f"Some English voices: {english}. Also: {others}. "
        "Every language has more: pass any name you are asked for as is, in "
        "Latin letters. "
        "A name says nothing about accent or gender, so for either, or a "
        "description, call list_voices first."
    )


def list_voices_text(code: str) -> str:
    language = LANGUAGES.get((code or "").strip().lower())
    if language is None:
        return "This line does not have voices in that language."
    voices = ", ".join(f"{v.name} ({v.blurb})" for v in voices_for(language.code))
    return f"{language.name} voices: {voices}"


def confirmation(voice: Voice, language_changed: bool) -> str:
    """The function result that makes the confirmation the first new-voice turn."""
    if not language_changed:
        return f"Done: you are now {voice.name.title()}. Say so briefly."
    name = language_of(voice).name
    return (
        f"Done: you are now {voice.name.title()}, {article(name)} {name} voice. "
        f"Say so briefly, in {name}."
    )


def settings_switch_note(voice: Voice) -> str:
    """The context note for a voice picked in the Settings panel.

    The switch didn't come from a set_voice call, so without it the model
    would see earlier turns in one language and no reason to change. It isn't
    spoken: the microphone is off while Settings is open, and nobody asked a
    question.
    """
    name = language_of(voice).name
    return (
        f"(The caller switched your voice to {voice.name.title()}, "
        f"{article(voice.blurb)} {voice.blurb}, in Settings. Reply only in {name} "
        "from now on.)"
    )


def client_catalog() -> dict:
    """The catalog as the claims UI's voice picker reads it, from voices.json.

    scripts/export_voices.py writes it, and a test fails when the file falls
    behind this module.
    """
    return {
        "languages": [{"code": lang.code, "name": lang.name} for lang in LANGUAGES.values()],
        "voices": [
            {
                "name": v.name,
                "model": v.model,
                "blurb": v.blurb,
                "lang": v.lang,
                "featured": v.featured,
            }
            for v in VOICES
        ],
        "default": DEFAULT_VOICE.name,
    }
