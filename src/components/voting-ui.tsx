"use client";

import { useOptimistic, useEffect, useState, startTransition } from "react";
import { submitVote } from "@/app/actions";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

type PollWithOptions = {
  id: string;
  title: string;
  options: { id: string; text: string; votes: number; pollId: string }[];
};

export function VotingUI({ poll }: { poll: PollWithOptions }) {
  const [voted, setVoted] = useState(false);
  const [optimisticPoll, addOptimisticVote] = useOptimistic(
    poll,
    (state, updateOptionId: string) => {
      const options = state.options.map((o) =>
        o.id === updateOptionId ? { ...o, votes: o.votes + 1 } : o
      );
      return { ...state, options };
    }
  );

  useEffect(() => {
    const hasVoted = localStorage.getItem(`voted-${poll.id}`);
    if (hasVoted) setVoted(true);
  }, [poll.id]);

  const handleVote = (optionId: string) => {
    if (voted) return;
    localStorage.setItem(`voted-${poll.id}`, "true");
    setVoted(true);

    startTransition(async () => {
      addOptimisticVote(optionId);
      await submitVote(optionId, poll.id);
    });
  };

  const totalVotes = optimisticPoll.options.reduce((a, o) => a + o.votes, 0);
  const chartData = optimisticPoll.options.map((o) => ({
    name: o.text,
    votes: o.votes,
  }));

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="text-center">投票結果</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {optimisticPoll.options.map((o) => {
            const pct = totalVotes > 0 ? (o.votes / totalVotes) * 100 : 0;
            return (
              <div key={o.id}>
                <div className="flex justify-between items-center mb-1">
                  <span className="font-medium">{o.text}</span>
                  <span className="text-sm text-gray-500">
                    {o.votes}票({pct.toFixed(1)}%)
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div
                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <Button
                  onClick={() => handleVote(o.id)}
                  disabled={voted}
                  className="mt-2"
                >
                  {voted ? "投票済み" : `「${o.text}」に投票`}
                </Button>
              </div>
            );
          })}
        </div>
        <div className="mt-8">
          <h3 className="text-lg font-semibold text-center mb-4">グラフ</h3>
          <ResponsiveContainer
            width="100%"
            height={300}
            initialDimension={{ width: 520, height: 300 }}
          >
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
            >
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="name"
                width={80}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip cursor={{ fill: "#f3f4f6" }} />
              <Bar
                dataKey="votes"
                fill="#3b82f6"
                background={{ fill: "#eee" }}
                barSize={20}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
