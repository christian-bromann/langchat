"use client";

import { useState } from "react";
import Sidebar from "./components/Sidebar";
import ChatInterface from "./components/ChatInterface";

export default function Home() {
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);

  return (
    <div className="flex h-screen bg-white dark:bg-black">
      <Sidebar
        selectedScenario={selectedScenario}
        onScenarioSelect={setSelectedScenario}
      />
      <main className="flex-1 flex flex-col overflow-hidden">
        <ChatInterface selectedScenario={selectedScenario} />
      </main>
    </div>
  );
}
