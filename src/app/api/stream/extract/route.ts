import { prepareMediaJob } from "@/lib/mediaJobRoute";

export const POST = (request: Request) => prepareMediaJob(request, "audio");
