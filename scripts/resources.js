const TAG_CLASS = {
  "Free Tier": "tag-free",
  "Course": "tag-course",
  "Certification": "tag-cert",
  "Hands-on": "tag-handson",
  "Students": "tag-students"
};

const resourcesListEl = document.getElementById("resourcesList");
const loadingMsgEl = document.getElementById("loadingMsg");

async function init() {
  if (!resourcesListEl) return;

  try {
    const response = await fetch("./learning-resources.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const resources = await response.json();
    if (!Array.isArray(resources)) throw new Error("Invalid format");

    if (loadingMsgEl) loadingMsgEl.remove();

    const fragment = document.createDocumentFragment();
    for (const resource of resources) {
      const safeUrl = /^https:\/\//i.test(resource.url) ? resource.url : "#";
      const tagClass = TAG_CLASS[resource.tag] || "tag-default";

      const a = document.createElement("a");
      a.href = safeUrl;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.className = "resource-card";
      a.setAttribute("aria-label", resource.title);

      const top = document.createElement("div");
      top.className = "resource-card-top";

      const emojiEl = document.createElement("span");
      emojiEl.className = "resource-emoji";
      emojiEl.setAttribute("aria-hidden", "true");
      emojiEl.textContent = resource.emoji || "📌";

      const tagEl = document.createElement("span");
      tagEl.className = `resource-tag ${tagClass}`;
      tagEl.textContent = resource.tag;

      top.appendChild(emojiEl);
      top.appendChild(tagEl);

      const titleEl = document.createElement("h3");
      titleEl.textContent = resource.title;

      const descEl = document.createElement("p");
      descEl.textContent = resource.description;

      a.appendChild(top);
      a.appendChild(titleEl);
      a.appendChild(descEl);
      fragment.appendChild(a);
    }
    resourcesListEl.appendChild(fragment);
  } catch {
    if (loadingMsgEl) {
      loadingMsgEl.textContent = "Resources temporarily unavailable.";
    }
  }
}

init();
