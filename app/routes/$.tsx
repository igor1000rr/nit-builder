export function loader() {
  throw new Response(null, { status: 404, statusText: "Not Found" });
}

export function meta() {
  return [{ title: "404 — Страница не найдена | NIT Builder" }];
}

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center">
      <div className="text-8xl mb-6 opacity-30">📄</div>
      <h1 className="text-6xl md:text-8xl font-extrabold mb-4 bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">
        404
      </h1>
      <p className="text-xl text-slate-400 mb-8 max-w-md">
        Такой страницы нет. Но ты можешь создать свой сайт прямо сейчас.
      </p>
      <a
        href="/"
        className="px-8 py-4 bg-gradient-to-r from-blue-500 to-violet-500 rounded-full font-semibold hover:scale-105 transition shadow-lg shadow-blue-500/30"
      >
        Создать сайт →
      </a>
    </div>
  );
}
