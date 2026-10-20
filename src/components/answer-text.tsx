export function AnswerText({
  text,
  onCite,
}: {
  text: string;
  onCite: (n: number) => void;
}) {
  const parts = text.split(/(\[\d+\])/g);
  return (
    <p className="whitespace-pre-wrap font-serif text-[1.05rem] leading-7">
      {parts.map((part, index) => {
        const match = /^\[(\d+)\]$/.exec(part);
        if (!match) return <span key={index}>{part}</span>;
        const n = Number(match[1]);
        return (
          <button
            key={index}
            type="button"
            onClick={() => onCite(n)}
            aria-label={`Citation ${n}`}
            className="mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-pine px-1.5 align-super text-[11px] font-semibold text-white"
          >
            {n}
          </button>
        );
      })}
    </p>
  );
}
