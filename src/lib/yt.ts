import * as ytdl from "@distube/ytdl-core";

export const agent = ytdl.createAgent(JSON.parse(process.env.TOKEN));
