export function meta() {
  return [
    { title: "NIT Builder — Создай сайт за минуту через свой GPU" },
    {
      name: "description",
      content: "Бесплатный AI конструктор сайтов. Приноси свой GPU через туннель — генерация полностью на твоей машине, мы только маршрутизируем. Open source.",
    },
  ];
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <nav className="fixed w-full top-0 z-50 bg-slate-950/80 backdrop-blur border-b border-slate-900">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <a href="/" className="font-bold text-xl bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">
            NIT Builder
          </a>
          <div className="hidden md:flex gap-8 text-sm">
            <a href="#how" className="text-slate-400 hover:text-white">Как это работает</a>
            <a href="#gallery" className="text-slate-400 hover:text-white">Что можно создать</a>
            <a href="#hardware" className="text-slate-400 hover:text-white">Для какого компьютера</a>
            <a href="#faq" className="text-slate-400 hover:text-white">FAQ</a>
          </div>
          <div className="flex items-center gap-2">
            <a href="/login" className="hidden sm:inline px-3 py-2 text-sm text-slate-400 hover:text-white transition">
              Войти
            </a>
            <a href="/register" className="px-5 py-2 bg-gradient-to-r from-blue-500 to-violet-500 rounded-full text-sm font-medium hover:scale-105 transition">
              Регистрация
            </a>
          </div>
        </div>
      </nav>

      <section className="pt-40 pb-24 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 border border-slate-800 text-sm text-slate-400 mb-8">
            🇧🇾 Первая беларусская нейронная сеть
          </div>
          <h1 className="text-5xl md:text-8xl font-extrabold mb-8 leading-[1.05]">
            Создай сайт<br />
            <span className="bg-gradient-to-r from-blue-400 via-violet-400 to-pink-400 bg-clip-text text-transparent">
              на своём компьютере
            </span>
          </h1>
          <p className="text-xl md:text-2xl text-slate-400 max-w-3xl mx-auto mb-12">
            NIT Builder — peer-to-peer AI конструктор сайтов. Подключаешь свой GPU через туннель,
            генерация идёт на твоей машине. Бесплатно, приватно, open source.
          </p>
          <div className="flex flex-wrap justify-center gap-4 mb-16">
            <a href="/" className="px-8 py-4 bg-gradient-to-r from-blue-500 to-violet-500 rounded-full font-semibold hover:scale-105 transition shadow-lg shadow-blue-500/30">
              Создать сайт бесплатно
            </a>
            <a href="#how" className="px-8 py-4 border border-slate-700 rounded-full font-semibold hover:border-white transition">
              Как это работает
            </a>
          </div>
          <div className="flex flex-wrap justify-center gap-8 text-sm text-slate-500">
            <div className="flex items-center gap-2">✅ Без подписки</div>
            <div className="flex items-center gap-2">✅ Свой GPU</div>
            <div className="flex items-center gap-2">✅ Открытый исходный код</div>
            <div className="flex items-center gap-2">✅ Приватность</div>
          </div>
        </div>
      </section>

      <section id="how" className="py-24 px-6 border-t border-slate-900">
        <div className="max-w-5xl mx-auto">
          <p className="text-blue-400 font-medium uppercase tracking-widest text-sm text-center mb-4">Как это работает</p>
          <h2 className="text-4xl md:text-6xl font-bold text-center mb-16">Три шага</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-8 bg-slate-900/50 border border-slate-800 rounded-3xl">
              <div className="text-5xl mb-6">1️⃣</div>
              <h3 className="text-2xl font-bold mb-3">Установи LM Studio</h3>
              <p className="text-slate-400 mb-4">Скачай бесплатное приложение и модель Qwen2.5-Coder-7B. Работает на любой видеокарте от 8ГБ.</p>
              <a href="https://lmstudio.ai" target="_blank" rel="noopener" className="text-blue-400 text-sm hover:underline">lmstudio.ai →</a>
            </div>
            <div className="p-8 bg-slate-900/50 border border-slate-800 rounded-3xl">
              <div className="text-5xl mb-6">2️⃣</div>
              <h3 className="text-2xl font-bold mb-3">Опиши сайт</h3>
              <p className="text-slate-400">Напиши что хочешь простыми словами. "Сайт для кофейни", "портфолио фотографа", "страница свадьбы".</p>
            </div>
            <div className="p-8 bg-slate-900/50 border border-slate-800 rounded-3xl">
              <div className="text-5xl mb-6">3️⃣</div>
              <h3 className="text-2xl font-bold mb-3">Готово за минуту</h3>
              <p className="text-slate-400">Живое превью. Правки через чат. Скачай HTML-файл — и размещай где угодно.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="gallery" className="py-24 px-6 border-t border-slate-900">
        <div className="max-w-6xl mx-auto">
          <p className="text-blue-400 font-medium uppercase tracking-widest text-sm text-center mb-4">Что можно создать</p>
          <h2 className="text-4xl md:text-6xl font-bold text-center mb-16">15 готовых шаблонов</h2>
          <div className="grid grid-cols-3 md:grid-cols-5 gap-4">
            {[
              ["☕", "Кофейня"], ["💈", "Барбершоп"], ["📸", "Фотограф"], ["💻", "Портфолио"], ["💒", "Свадьба"],
              ["💪", "Фитнес"], ["🍽️", "Ресторан"], ["📚", "Репетитор"], ["💅", "Мастер красоты"], ["🔧", "Автосервис"],
              ["🎨", "Хендмейд"], ["🎧", "DJ/Музыка"], ["🚀", "SaaS"], ["🦷", "Клиника"], ["🧘", "Йога"],
            ].map(([emoji, name]) => (
              <div key={name} className="aspect-square flex flex-col items-center justify-center gap-2 bg-slate-900/50 border border-slate-800 rounded-2xl hover:border-blue-500/50 transition">
                <span className="text-4xl">{emoji}</span>
                <span className="text-xs text-slate-400">{name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="hardware" className="py-24 px-6 border-t border-slate-900">
        <div className="max-w-4xl mx-auto">
          <p className="text-blue-400 font-medium uppercase tracking-widest text-sm text-center mb-4">Для какого компьютера</p>
          <h2 className="text-4xl md:text-6xl font-bold text-center mb-16">Работает почти везде</h2>
          <div className="space-y-3">
            {[
              ["4 ГБ VRAM", "Qwen2.5-Coder-3B-Q4", "Медленно, но работает", "amber"],
              ["8 ГБ VRAM (RTX 3060 / 4060)", "Qwen2.5-Coder-7B-Q4", "Рекомендуем — отличное качество", "emerald"],
              ["12+ ГБ VRAM (RTX 3080+)", "Qwen2.5-Coder-14B-Q4", "Максимальное качество", "blue"],
              ["Нет GPU", "Groq API (бесплатно онлайн)", "Быстрее локального, нужен интернет", "violet"],
            ].map(([spec, model, note, color]) => (
              <div key={spec as string} className="flex flex-wrap items-center justify-between gap-4 p-6 bg-slate-900/50 border border-slate-800 rounded-2xl">
                <div className="flex-1 min-w-[200px]">
                  <div className="font-semibold">{spec}</div>
                  <div className={`text-sm text-${color}-400 font-mono`}>{model}</div>
                </div>
                <div className="text-sm text-slate-400">{note}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="compare" className="py-24 px-6 border-t border-slate-900 bg-gradient-to-b from-slate-950 to-slate-900/50">
        <div className="max-w-5xl mx-auto">
          <p className="text-blue-400 font-medium uppercase tracking-widest text-sm text-center mb-4">Сравнение</p>
          <h2 className="text-4xl md:text-6xl font-bold text-center mb-16">Почему NIT</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left p-4 text-slate-500">Фича</th>
                  <th className="text-center p-4 text-blue-400 font-bold">NIT Builder</th>
                  <th className="text-center p-4 text-slate-500">Tilda</th>
                  <th className="text-center p-4 text-slate-500">v0 / Bolt</th>
                  <th className="text-center p-4 text-slate-500">Wix</th>
                </tr>
              </thead>
              <tbody className="text-slate-300">
                {[
                  ["Цена", "Бесплатно", "1500₽/мес", "$20/мес", "1200₽/мес"],
                  ["AI генерация", "✅", "❌", "✅", "⚠️"],
                  ["Свой GPU вместо облака", "✅", "❌", "❌", "❌"],
                  ["Приватность (твоя машина)", "✅", "❌", "❌", "❌"],
                  ["Экспорт HTML", "✅", "❌", "✅", "❌"],
                  ["Открытый исходник", "✅", "❌", "❌", "❌"],
                ].map(([feat, nit, tilda, v0, wix]) => (
                  <tr key={feat} className="border-b border-slate-900">
                    <td className="p-4 font-medium">{feat}</td>
                    <td className="text-center p-4 text-emerald-400 font-semibold">{nit}</td>
                    <td className="text-center p-4 text-slate-500">{tilda}</td>
                    <td className="text-center p-4 text-slate-500">{v0}</td>
                    <td className="text-center p-4 text-slate-500">{wix}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section id="faq" className="py-24 px-6 border-t border-slate-900">
        <div className="max-w-3xl mx-auto">
          <p className="text-blue-400 font-medium uppercase tracking-widest text-sm text-center mb-4">FAQ</p>
          <h2 className="text-4xl md:text-6xl font-bold text-center mb-16">Вопросы</h2>
          <div className="space-y-4">
            {[
              ["Что такое LM Studio?", "Бесплатное приложение для запуска AI-моделей на твоём компьютере. Никаких подписок, никакого облака. Скачиваешь, запускаешь, работает."],
              ["Какая нужна видеокарта?", "От 4 ГБ VRAM — работает, но медленно. 8 ГБ (RTX 3060/4060, RX 6600) — оптимально. 12+ ГБ — максимальное качество."],
              ["А если нет GPU?", "Используй Groq — бесплатный облачный провайдер. Очень быстро, просто нужен интернет."],
              ["Можно ли продавать созданные сайты?", "Да. HTML-файл принадлежит тебе полностью. Никаких лицензионных ограничений."],
              ["Где хостить готовый сайт?", "Любой хостинг: GitHub Pages (бесплатно), Netlify, Vercel, Cloudflare Pages, или обычный хостинг. Это один HTML-файл."],
              ["Это open source?", "Да. Исходный код на GitHub. Можешь форкнуть, допилить, развернуть у себя."],
            ].map(([q, a]) => (
              <details key={q as string} className="group bg-slate-900/50 border border-slate-800 rounded-2xl">
                <summary className="flex items-center justify-between p-6 cursor-pointer list-none">
                  <span className="font-semibold text-lg">{q}</span>
                  <span className="text-slate-500 group-open:rotate-45 transition">+</span>
                </summary>
                <p className="px-6 pb-6 text-slate-400">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="py-32 px-6 border-t border-slate-900">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-5xl md:text-7xl font-extrabold mb-8">
            Готов создать<br />
            <span className="bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">свой сайт?</span>
          </h2>
          <p className="text-xl text-slate-400 mb-10">Это займёт меньше минуты.</p>
          <a href="/" className="inline-block px-12 py-5 bg-gradient-to-r from-blue-500 to-violet-500 rounded-full font-bold text-lg hover:scale-105 transition shadow-2xl shadow-blue-500/30">
            Создать сайт →
          </a>
        </div>
      </section>

      <footer className="py-12 px-6 border-t border-slate-900 text-center text-slate-500 text-sm">
        <p className="font-bold bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent text-lg mb-2">
          NIT Builder
        </p>
        <p>© 2025 · Первая беларусская нейронная сеть · Open source</p>
      </footer>
    </div>
  );
}
