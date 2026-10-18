import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { SongCard } from "./song-card";
it("preserves original song metadata and replaces failed artwork without removing the source", () => {
  const song = { provider: "spotify" as const, trackId: "0123456789ABCDEFGHIJKL", title: "원곡 제목", artist: "原文 Artist", album: "Album", artworkUrl: "https://i.scdn.co/image/abcdef", sourceUrl: "https://open.spotify.com/track/0123456789ABCDEFGHIJKL" };
  const { container } = render(<SongCard song={song} locale="fr" />);
  expect(screen.getByText(song.title)).toBeInTheDocument();
  expect(screen.getByText(song.artist)).toBeInTheDocument();
  const artwork = container.querySelector("img")!;
  expect(artwork).toHaveAttribute("width", "72");
  expect(artwork).toHaveAttribute("height", "72");
  fireEvent.error(artwork);
  expect(container.querySelector("img")).toBeNull();
  expect(screen.getByRole("link", { name: "Écouter sur Spotify" })).toHaveAttribute("href", song.sourceUrl);
});
