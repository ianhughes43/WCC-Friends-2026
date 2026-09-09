"use client";

import { ReactNode, useEffect, useState } from "react";

type TabKey = "overall" | "squid" | "tour";

type CompetitionTabsProps = {
  overall: ReactNode;
  squid: ReactNode;
  tour: ReactNode;
};

const validTabs: TabKey[] = ["overall", "squid", "tour"];

export default function CompetitionTabs({ overall, squid, tour }: CompetitionTabsProps) {
  const [active, setActive] = useState<TabKey>("overall");

  useEffect(() => {
    const hash = window.location.hash.replace("#", "") as TabKey;
    if (validTabs.includes(hash)) setActive(hash);
  }, []);

  function changeTab(tab: TabKey) {
    setActive(tab);
    window.history.replaceState(null, "", `#${tab}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <>
      <nav className="tabs" role="tablist" aria-label="WCC competitions">
        <button
          type="button"
          className={active === "overall" ? "tab active" : "tab"}
          onClick={() => changeTab("overall")}
          role="tab"
          aria-selected={active === "overall"}
        >
          <span>🏆</span> Overall League
        </button>
        <button
          type="button"
          className={active === "squid" ? "tab active squidTab" : "tab squidTab"}
          onClick={() => changeTab("squid")}
          role="tab"
          aria-selected={active === "squid"}
        >
          <span>🦑</span> Squid
        </button>
        <button
          type="button"
          className={active === "tour" ? "tab active tourTab" : "tab tourTab"}
          onClick={() => changeTab("tour")}
          role="tab"
          aria-selected={active === "tour"}
        >
          <span>⛳</span> The Tour
        </button>
      </nav>

      <div className="tabPanel" role="tabpanel">
        {active === "overall" && overall}
        {active === "squid" && squid}
        {active === "tour" && tour}
      </div>
    </>
  );
}
