INSERT INTO Poll (id, title) VALUES ("poll1", "好きなフロントエンドフレームワークは？");
INSERT INTO PollOption (id, text, votes, pollId) VALUES
("opt1", "React", 0, "poll1"),
("opt2", "Vue", 0, "poll1"),
("opt3", "Svelte", 0, "poll1"),
("opt4", "SolidJS", 0, "poll1");