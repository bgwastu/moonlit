export const getDownloadUrl = async (url: string) => {
  "use server";

  const response = await fetch(process.env.COBALT_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      url: url,
      downloadMode: "audio",
      videoQuality: "720",
    }),
  });

  if (response.ok) {
    const data = await response.json();
    const downloadUrl = data.url;
    return downloadUrl;
  } else {
    throw new Error("Failed to get download URL");
  }
};
