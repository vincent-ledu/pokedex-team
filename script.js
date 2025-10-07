const cardsContainer = document.getElementById("cards");

async function main() {
  if (!cardsContainer) {
    return;
  }

  const teamMembers = await loadTeamMembers();
  teamMembers.forEach((member) => {
    const card = document.createElement("article");
    card.className = "card";

    const image = document.createElement("img");
    image.src = member.image;
    image.alt = `${member.pokemon} de ${member.name}`;
    image.loading = "lazy";

    const content = document.createElement("div");
    content.className = "card-content";

    const title = document.createElement("h2");
    title.textContent = member.name;

    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = member.pokemon;

    const description = document.createElement("p");
    description.className = "description";
    description.textContent = member.description;

    content.appendChild(title);
    content.appendChild(badge);
    content.appendChild(description);

    card.appendChild(image);
    card.appendChild(content);

    cardsContainer.appendChild(card);
  });
}

async function loadTeamMembers() {
  if (window.location.protocol === "file:") {
    if (Array.isArray(window.__TEAM_DATA__)) {
      return window.__TEAM_DATA__;
    }

    console.error(
      "Aucune donnée intégrée trouvée. Assurez-vous que data.js est chargé avant script.js."
    );
    return [];
  }

  try {
    const response = await fetch("data.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Impossible de charger data.json (statut ${response.status})`);
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new Error("Le format de data.json est invalide : un tableau est attendu.");
    }

    return data;
  } catch (error) {
    console.error("Erreur lors du chargement des données de l'équipe :", error);
    return [];
  }
}

main();
