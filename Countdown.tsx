"use client";

import { useEffect, useState } from "react";

function getParts(deadline: string) {
  const distance = Math.max(0, new Date(deadline).getTime() - Date.now());
  return {
    d: Math.floor(distance / 86_400_000),
    h: Math.floor((distance / 3_600_000) % 24),
    m: Math.floor((distance / 60_000) % 60),
    s: Math.floor((distance / 1000) % 60),
  };
}

export default function Countdown({ deadline }: { deadline: string }) {
  const [parts, setParts] = useState(() => getParts(deadline));
  useEffect(() => {
    const timer = setInterval(() => setParts(getParts(deadline)), 1000);
    return () => clearInterval(timer);
  }, [deadline]);

  return (
    <div className="countdown" aria-label="Time to next deadline">
      {Object.entries(parts).map(([label, value]) => (
        <div className="timeCell" key={label}>
          <strong>{String(value).padStart(2, "0")}</strong>
          <span>{label.toUpperCase()}</span>
        </div>
      ))}
    </div>
  );
}
