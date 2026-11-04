"""Voice and language catalog for the claims agent.

The voice is the only language setting: every voice belongs to exactly one
language, and choosing it chooses the listen model and the language the agent
replies in. There is no separate language setting that could disagree with it.

Only languages that Deepgram's flux-general-multi listen model can hear are
offered. A voice in a language the agent can't understand is a voice nobody
can talk back to.

Voices come from https://developers.deepgram.com/docs/flux-tts/voices
"""

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class Language:
    code: str  # ISO code: the model suffix and the Flux language hint
    name: str  # used in the prompt and tool text
    # Spoken while a claim lookup runs. Written in the language itself, since
    # the voice would otherwise read the English text with a foreign accent.
    filler: str


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
        Language("en", "English", "Let me look that up for you, one second please."),
        Language("es", "Spanish", "Permítame buscarlo, un momento, por favor."),
        Language("fr", "French", "Je vérifie cela pour vous, un instant, s'il vous plaît."),
        Language("de", "German", "Ich sehe das für Sie nach, einen Moment bitte."),
        Language("hi", "Hindi", "कृपया एक क्षण रुकिए, जानकारी देखी जा रही है।"),
        Language("ru", "Russian", "Сейчас посмотрю, одну секунду, пожалуйста."),
        Language("pt", "Portuguese", "Vou verificar isso, um momento, por favor."),
        Language("it", "Italian", "Controllo subito, un momento, per favore."),
        Language("nl", "Dutch", "Ik zoek het even voor u op, een moment alstublieft."),
    ]
}

# Featured voices are named in the set_voice description; the rest are only
# reachable through list_voices, which keeps the tool definitions small.
FEATURED = {
    "heather", "alexis", "kit", "cliff", "colin", "miles",  # English
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

DEFAULT_VOICE: Voice = _BY_KEY["heather"]


def find_voice(name_or_model: str) -> Voice | None:
    """Find a voice by short name or model id, ignoring case and spaces.

    Transcripts sometimes wrap the name, as in "Voice Kit" or "Kit, please",
    and the model passes that on as is. When there's no exact match, a single
    word that names a voice is accepted.
    """
    key = name_or_model.strip().lower()
    if key in _BY_KEY:
        return _BY_KEY[key]
    matches = {_BY_KEY[w] for w in re.findall(r"[a-z]+", key) if w in _BY_KEY}
    return matches.pop() if len(matches) == 1 else None


def voice_or_default(name_or_model: str | None) -> Voice:
    """The named voice, or the default when it's unknown or no longer offered."""
    return (name_or_model and find_voice(name_or_model)) or DEFAULT_VOICE


def language_of(voice: Voice) -> Language:
    return LANGUAGES[voice.lang]


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
    return "an" if word[:1].lower() in "aeiou" else "a"


def listen_settings(voice: Voice) -> dict:
    """Flux listen settings for the voice's language.

    English listens with flux-general-en. Every other language listens with
    flux-general-multi, hinted toward that language and English, so
    "switch back to English" is still heard.
    """
    if voice.lang == "en":
        return {"model": "flux-general-en", "language_hints": None}
    return {"model": "flux-general-multi", "language_hints": [voice.lang, "en"]}


def set_voice_description() -> str:
    featured = [v for v in VOICES if v.featured]
    english = ", ".join(v.name for v in featured if v.lang == "en")
    others = ", ".join(
        f"{language_of(v).name} ({v.name})" for v in featured if v.lang != "en"
    )
    return (
        "Change your voice, and with it your language. "
        f"Some English voices: {english}. Also: {others}. "
        "Every language has more: pass any name you are asked for as is. "
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
