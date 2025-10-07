#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");
const https = require("node:https");

const ALIAS_DATA_URL = "https://raw.githubusercontent.com/fanzeyi/pokemon.json/master/pokedex.json";
let aliasMapPromise;

async function main() {
  const [inputPath, outputPath] = process.argv.slice(2);

  if (!inputPath) {
    console.error("Usage: node generate-team-data.js <input.csv> [output.json]");
    process.exit(1);
  }

  const resolvedInput = path.resolve(process.cwd(), inputPath);
  const csvContent = await fs.readFile(resolvedInput, "utf8");
  const rows = parseCsv(csvContent);

  if (rows.length === 0) {
    console.error("No data found in CSV.");
    process.exit(1);
  }

  const datasets = [];
  for (const row of rows) {
    const [person, pokemon] = row;

    if (!person || !pokemon) {
      console.warn(`Skipping incomplete row: ${JSON.stringify(row)}`);
      continue;
    }

    const trimmedPokemon = pokemon.trim();
    try {
      const identifier = await resolvePokemonIdentifier(trimmedPokemon);
      const [pokemonData, speciesData] = await Promise.all([
        fetchJson(`https://pokeapi.co/api/v2/pokemon/${encodeURIComponent(identifier)}`),
        fetchJson(`https://pokeapi.co/api/v2/pokemon-species/${encodeURIComponent(identifier)}`)
      ]);

      const image =
        pokemonData?.sprites?.other?.["official-artwork"]?.front_default ??
        pokemonData?.sprites?.front_default ??
        null;

      if (!image) {
        console.warn(`No artwork found for ${pokemon}.`);
      }

      const description = extractFlavorText(speciesData);

      datasets.push({
        name: person.trim(),
        pokemon: capitalizeName(trimmedPokemon),
        image,
        description
      });
    } catch (error) {
      console.error(`Failed to fetch data for ${pokemon}: ${error.message}`);
    }
  }

  const jsonOutput = JSON.stringify(datasets, null, 2);

  if (outputPath) {
    const resolvedOutput = path.resolve(process.cwd(), outputPath);
    await fs.writeFile(resolvedOutput, jsonOutput, "utf8");
    console.log(`Data written to ${resolvedOutput}`);
    const sidecarPath = buildSidecarPath(resolvedOutput);
    const jsPayload = `window.__TEAM_DATA__ = ${jsonOutput};\n`;
    await fs.writeFile(sidecarPath, jsPayload, "utf8");
    console.log(`Fallback JS data written to ${sidecarPath}`);
  } else {
    process.stdout.write(jsonOutput);
  }
}

function parseCsv(content) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => line.split(",").map((value) => value.trim()));
}

async function resolvePokemonIdentifier(rawName) {
  const aliasMap = await getPokemonAliasMap();
  const normalized = normalizeName(rawName);

  if (aliasMap.has(normalized)) {
    return aliasMap.get(normalized);
  }

  const slug = slugifyName(rawName);
  return slug.length > 0 ? slug : rawName;
}

async function getPokemonAliasMap() {
  if (!aliasMapPromise) {
    aliasMapPromise = buildPokemonAliasMap().catch((error) => {
      console.error("Impossible de récupérer la table des alias Pokémon :", error);
      return new Map();
    });
  }
  return aliasMapPromise;
}

async function buildPokemonAliasMap() {
  const data = await fetchJson(ALIAS_DATA_URL);
  const map = new Map();

  data.forEach((entry) => {
    const id = String(entry.id);
    const english = entry.name?.english ?? "";
    const french = entry.name?.french ?? "";

    [id, english, french, slugifyName(english)].forEach((variant) => {
      if (variant) {
        map.set(normalizeName(variant), id);
      }
    });
  });

  return map;
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            "User-Agent": "team-pokedex-script/1.0 (+https://pokeapi.co/)",
            Accept: "application/json",
            "Accept-Encoding": "identity"
          }
        },
        (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            fetchJson(res.headers.location).then(resolve).catch(reject);
            return;
          }

          if (res.statusCode < 200 || res.statusCode >= 300) {
            res.resume();
            reject(new Error(`Request failed with status ${res.statusCode}`));
            return;
          }

          const data = [];
          res.on("data", (chunk) => data.push(chunk));
          res.on("end", () => {
            try {
              const buffer = Buffer.concat(data);
              resolve(JSON.parse(buffer.toString("utf8")));
            } catch (error) {
              reject(error);
            }
          });
        }
      )
      .on("error", reject);
  });
}

function extractFlavorText(speciesData) {
  const entries = speciesData?.flavor_text_entries ?? [];
  const frenchEntry = entries.find((entry) => entry.language?.name === "fr");
  const englishEntry = entries.find((entry) => entry.language?.name === "en");
  const fallback = entries[0];

  const text = frenchEntry?.flavor_text ?? englishEntry?.flavor_text ?? fallback?.flavor_text ?? "";
  return sanitizeFlavorText(text);
}

function sanitizeFlavorText(rawText) {
  return rawText
    .replace(/\f/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function capitalizeName(name) {
  return name
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function normalizeName(value) {
  return value
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function slugifyName(value) {
  return normalizeName(value);
}

function buildSidecarPath(outputFile) {
  const directory = path.dirname(outputFile);
  const baseName = path.basename(outputFile, path.extname(outputFile));
  return path.join(directory, `${baseName}.js`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
