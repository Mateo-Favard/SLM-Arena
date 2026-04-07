import React, { useState } from "react";
import { CreateMatchForm } from "../components/CreateMatchForm";
import { MatchList } from "../components/MatchList";

export const HomePage: React.FC = () => {
  const [trackedJobs, setTrackedJobs] = useState<string[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleMatchCreated = (jobId: string) => {
    setTrackedJobs((prev) => [jobId, ...prev]);
    setRefreshTrigger((n) => n + 1);
  };

  return (
    <>
      <CreateMatchForm onMatchCreated={handleMatchCreated} />
      <MatchList trackedJobs={trackedJobs} refreshTrigger={refreshTrigger} />
    </>
  );
};
