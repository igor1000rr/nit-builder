type Step = "plan" | "template" | "code" | "done";

type Props = {
  currentStep: Step;
  templateName?: string;
  streamingChars?: number;
};

const STEPS: Array<{ id: Step; label: string; icon: string }> = [
  { id: "plan", label: "Анализ", icon: "🧠" },
  { id: "template", label: "Шаблон", icon: "📋" },
  { id: "code", label: "Код", icon: "⚡" },
  { id: "done", label: "Готово", icon: "✨" },
];

const STEP_ORDER: Record<Step, number> = { plan: 0, template: 1, code: 2, done: 3 };

export function PipelineProgress({ currentStep, templateName, streamingChars }: Props) {
  const currentIdx = STEP_ORDER[currentStep];

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="flex items-center justify-between relative">
        {/* Progress line background */}
        <div className="absolute left-0 right-0 top-6 h-0.5 bg-slate-800" style={{ zIndex: 0 }} />
        {/* Progress line fill */}
        <div
          className="absolute left-0 top-6 h-0.5 bg-gradient-to-r from-blue-500 to-violet-500 transition-all duration-500"
          style={{
            width: `${(currentIdx / (STEPS.length - 1)) * 100}%`,
            zIndex: 0,
          }}
        />

        {STEPS.map((step, i) => {
          const isActive = i === currentIdx;
          const isDone = i < currentIdx;
          return (
            <div key={step.id} className="relative flex flex-col items-center" style={{ zIndex: 1 }}>
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center text-xl border-2 transition-all duration-300 ${
                  isDone
                    ? "bg-gradient-to-br from-blue-500 to-violet-500 border-transparent scale-100"
                    : isActive
                    ? "bg-slate-900 border-blue-500 scale-110 shadow-lg shadow-blue-500/40"
                    : "bg-slate-900 border-slate-700 scale-100"
                }`}
              >
                {isDone ? (
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                  </svg>
                ) : isActive ? (
                  <span className="animate-pulse">{step.icon}</span>
                ) : (
                  <span className="opacity-40">{step.icon}</span>
                )}
              </div>
              <span
                className={`mt-3 text-xs font-medium transition ${
                  isActive || isDone ? "text-white" : "text-slate-500"
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {templateName && currentStep !== "done" && (
        <div className="mt-6 text-center">
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Выбран шаблон</p>
          <p className="text-sm text-blue-400 font-medium">{templateName}</p>
        </div>
      )}

      {streamingChars !== undefined && streamingChars > 0 && currentStep === "code" && (
        <div className="mt-4 text-center">
          <p className="text-xs text-slate-500">
            Сгенерировано{" "}
            <span className="text-blue-400 font-mono font-bold">{streamingChars.toLocaleString("ru-RU")}</span> символов
          </p>
        </div>
      )}
    </div>
  );
}
