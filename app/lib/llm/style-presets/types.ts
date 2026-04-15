/**
 * Style presets — концентрат дизайн-правил для Coder-агента.
 *
 * Мотивация: baseline генерация NIT Builder выдаёт generic-Tailwind лендинги.
 * Чтобы отличаться от Bolt/Lovable, даём пользователю выбор эстетики:
 * neon-cyber, editorial, tech-terminal. Каждый preset — это сжатый набор
 * правил (palette, fonts, signature moves), которые инжектятся в Coder
 * system prompt опционально.
 *
 * Без preset — текущее поведение (generic). Preset НЕ заменяет, а дополняет
 * существующий design-token pipeline — токены отвечают за color_mood, preset
 * за визуальный язык (глитч, хэйрлайн-бордеры, конические градиенты и т.д.).
 */

export type StylePresetId =
  | "generic"
  | "neon-cyber"
  | "editorial"
  | "tech-terminal";

export type StylePreset = {
  id: StylePresetId;
  name: string;
  tagline: string;
  description: string;

  /** false = заглушка, ещё не готова. UI должен показывать "coming soon". */
  available: boolean;

  /** Дизайн-токены пресета. Gradient friendly для Coder-а. */
  tokens: {
    /** Основные цвета. Первый — фон, второй — accent, далее по вкусу. */
    palette: string[];
    /** Основной шрифт (Google Font name). */
    fontDisplay?: string;
    /** Вторичный шрифт для body/mono. */
    fontBody?: string;
  };

  /** 5-10 правил для агента — что делает стиль узнаваемым. */
  principles: string[];

  /** HTML/CSS фрагменты как эталонные "сигнатурные приёмы". Коротко. */
  signatureMoves: string[];

  /**
   * Текст который инжектится в Coder system prompt. Если пусто — preset no-op.
   * Хранится здесь заранее собранным — быстрее чем собирать из tokens+principles
   * на каждый запрос.
   */
  systemPromptAddon: string;
};
