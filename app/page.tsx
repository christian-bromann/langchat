"use client";

import { useState } from "react";
import Sidebar from "./components/Sidebar";
import ChatInterface from "./components/ChatInterface";

export default function Home() {
  const [selectedScenario, setSelectedScenario] = useState<string | undefined>("simple-agent");
  const [apiKey, setApiKey] = useState<string>("");

  return (
    <div className="flex h-screen bg-white dark:bg-black">
      <Sidebar
        selectedScenario={selectedScenario}
        onScenarioSelect={setSelectedScenario}
        apiKey={apiKey}
        onApiKeyChange={setApiKey}
      />
      <main className="flex-1 flex flex-col overflow-hidden">
        <ChatInterface selectedScenario={selectedScenario} apiKey={apiKey} />
      </main>
    </div>
  );
}
