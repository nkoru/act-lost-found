/* =========================================================
   ACT LOST & FOUND — WORKFLOW HELPERS
========================================================= */
(function () {
  const KEYS = {
    reports: "act_reports",
    claims: "act_claims",
    returns: "act_returns",
    cases: "act_return_cases",
    notifications: "act_notifications",
    guestCases: "act_guest_cases",
  };

  const CLOUD_TABLES = {
    [KEYS.reports]: "reports",
    [KEYS.claims]: "claims",
    [KEYS.returns]: "return_leads",
    [KEYS.cases]: "return_cases",
    [KEYS.notifications]: "notifications",
  };

  let supabaseReadyPromise = null;

  function loadExternalScript(src) {
    return new Promise((resolve, reject) => {
      const existing = [...document.scripts].find(
        (script) => script.src === new URL(src, location.href).href,
      );

      if (existing) {
        if (
          window.supabase ||
          (src.includes("supabase-client.js") && window.ACTSupabase)
        ) {
          resolve();
          return;
        }

        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async function ensureSupabase() {
    if (window.ACTSupabase) {
      return window.ACTSupabase;
    }

    if (supabaseReadyPromise) {
      return supabaseReadyPromise;
    }

    supabaseReadyPromise = (async () => {
      if (!window.supabase) {
        await loadExternalScript(
          "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
        );
      }

      if (!window.ACTSupabase) {
        await loadExternalScript("supabase-client.js");
      }

      if (!window.ACTSupabase) {
        throw new Error("Supabase client could not be initialized.");
      }

      return window.ACTSupabase;
    })();

    return supabaseReadyPromise;
  }

  async function pushToCloud(key, records) {
    const table = CLOUD_TABLES[key];

    if (!table) {
      return;
    }

    const client = await ensureSupabase();

    const rows = (Array.isArray(records) ? records : [])
      .filter((record) => record?.id)
      .map((record) => ({
        id: String(record.id),
        data: record,
        updated_at:
          record.updatedAt || record.createdAt || new Date().toISOString(),
      }));

    if (!rows.length) {
      return;
    }

    const { error } = await client.from(table).upsert(rows, {
      onConflict: "id",
    });

    if (error) {
      console.error(`Supabase sync failed for ${table}:`, error);
    }
  }

  async function pullFromCloud(key) {
    const table = CLOUD_TABLES[key];

    if (!table) {
      return read(key);
    }

    const client = await ensureSupabase();

    const { data, error } = await client
      .from(table)
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) {
      console.error(`Supabase read failed for ${table}:`, error);
      return read(key);
    }

    const records = (data || []).map((row) => row.data).filter(Boolean);

    localStorage.setItem(key, JSON.stringify(records));

    return records;
  }

  async function syncAllFromCloud() {
    const keys = Object.keys(CLOUD_TABLES);

    let changed = false;

    for (const key of keys) {
      const before = localStorage.getItem(key) || "[]";

      const records = await pullFromCloud(key);

      const after = JSON.stringify(records || []);

      if (before !== after) {
        changed = true;
      }
    }

    return changed;
  }

  function read(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function write(key, value) {
    const previous = read(key);
    const next = Array.isArray(value) ? value : [];

    localStorage.setItem(key, JSON.stringify(next));

    // Only send records that were actually added/changed.
    // This prevents one PC from overwriting unrelated newer records
    // with an older copy of the whole array.
    const previousMap = new Map(
      previous
        .filter((record) => record?.id)
        .map((record) => [String(record.id), JSON.stringify(record)]),
    );

    const changedRecords = next.filter((record) => {
      if (!record?.id) return false;

      return previousMap.get(String(record.id)) !== JSON.stringify(record);
    });

    if (changedRecords.length) {
      pushToCloud(key, changedRecords).catch((error) => {
        console.error("Cloud write error:", error);
      });
    }
  }

  function id(prefix) {
    return `${prefix}-${Date.now().toString(36).toUpperCase()}${Math.random()
      .toString(36)
      .slice(2, 5)
      .toUpperCase()}`;
  }

  function code(length = 6) {
    let value = "";
    for (let i = 0; i < length; i += 1) {
      value += Math.floor(Math.random() * 10);
    }
    return value;
  }

  function normalize(value) {
    return String(value || "")
      .trim()
      .toLowerCase();
  }

  function matchWords(value) {
    const ignored = new Set([
      "a",
      "an",
      "the",
      "my",
      "item",
      "lost",
      "found",
      "at",
      "in",
      "on",
      "near",
    ]);

    return normalize(value)
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word && !ignored.has(word));
  }

  function textSimilarity(first, second) {
    const a = normalize(first);
    const b = normalize(second);

    if (!a || !b) return 0;

    if (a === b) {
      return 1;
    }

    if (a.includes(b) || b.includes(a)) {
      return 0.9;
    }

    const wordsA = matchWords(a);
    const wordsB = matchWords(b);

    if (!wordsA.length || !wordsB.length) {
      return 0;
    }

    const setA = new Set(wordsA);
    const setB = new Set(wordsB);

    const common = [...setA].filter((word) => setB.has(word)).length;
    const largest = Math.max(setA.size, setB.size);

    return largest ? common / largest : 0;
  }

  function reportDateValue(report) {
    const value =
      report?.dateISO ||
      report?.dateLost ||
      report?.dateFound ||
      report?.date ||
      "";

    if (!value) return null;

    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  function matchScore(source, candidate) {
    let score = 0;
    const reasons = [];

    // CATEGORY — 25 points
    const sourceCategory = normalize(source?.category);
    const candidateCategory = normalize(candidate?.category);

    if (
      sourceCategory &&
      candidateCategory &&
      sourceCategory === candidateCategory
    ) {
      score += 25;
      reasons.push("Same category");
    }

    // ITEM NAME — up to 30 points
    const itemSimilarity = textSimilarity(source?.item, candidate?.item);

    if (itemSimilarity >= 0.9) {
      score += 30;
      reasons.push("Very similar item name");
    } else if (itemSimilarity >= 0.5) {
      score += 22;
      reasons.push("Similar item name");
    } else if (itemSimilarity >= 0.25) {
      score += 12;
      reasons.push("Partially similar item name");
    }

    // COLOR — 15 points
    const sourceColor = normalize(source?.color);
    const candidateColor = normalize(candidate?.color);

    if (
      sourceColor &&
      candidateColor &&
      (sourceColor === candidateColor ||
        sourceColor.includes(candidateColor) ||
        candidateColor.includes(sourceColor))
    ) {
      score += 15;
      reasons.push("Same or similar color");
    }

    // LOCATION — 15 points
    const sourceLocation = normalize(
      source?.specificLocation || source?.location || source?.locationBase,
    );

    const candidateLocation = normalize(
      candidate?.specificLocation ||
        candidate?.location ||
        candidate?.locationBase,
    );

    if (
      sourceLocation &&
      candidateLocation &&
      (sourceLocation === candidateLocation ||
        sourceLocation.includes(candidateLocation) ||
        candidateLocation.includes(sourceLocation))
    ) {
      score += 15;
      reasons.push("Same or nearby location");
    }

    // DATE — up to 10 points
    const sourceDate = reportDateValue(source);
    const candidateDate = reportDateValue(candidate);

    if (sourceDate && candidateDate) {
      const difference =
        Math.abs(sourceDate.getTime() - candidateDate.getTime()) /
        (1000 * 60 * 60 * 24);

      if (difference < 1) {
        score += 10;
        reasons.push("Same date");
      } else if (difference <= 2) {
        score += 7;
        reasons.push("Dates are within 2 days");
      } else if (difference <= 7) {
        score += 3;
        reasons.push("Dates are within 1 week");
      }
    }

    // BRAND / MODEL — 5 points
    const sourceBrand = normalize(source?.brand);
    const candidateBrand = normalize(candidate?.brand);

    if (
      sourceBrand &&
      candidateBrand &&
      (sourceBrand === candidateBrand ||
        sourceBrand.includes(candidateBrand) ||
        candidateBrand.includes(sourceBrand))
    ) {
      score += 5;
      reasons.push("Same or similar brand/model");
    }

    return {
      score: Math.min(100, score),
      reasons,
    };
  }

  function possibleMatches(reportOrId, minimumScore = 60) {
    const source =
      typeof reportOrId === "object" ? reportOrId : findReport(reportOrId);

    if (!source) {
      return [];
    }

    const sourceType = normalize(source.type);

    if (!["lost", "found"].includes(sourceType)) {
      return [];
    }

    const oppositeType = sourceType === "lost" ? "found" : "lost";

    const excludedStatuses = new Set([
      "flagged",
      "rejected",
      "returned",
      "archived",
    ]);

    return read(KEYS.reports)
      .filter((candidate) => {
        if (!candidate?.id) return false;

        if (String(candidate.id) === String(source.id)) {
          return false;
        }

        if (normalize(candidate.type) !== oppositeType) {
          return false;
        }

        const status = normalize(candidate.status || "active");

        return !excludedStatuses.has(status);
      })
      .map((candidate) => {
        const result = matchScore(source, candidate);

        return {
          report: candidate,
          score: result.score,
          reasons: result.reasons,
          strength:
            result.score >= 75
              ? "strong"
              : result.score >= 60
                ? "possible"
                : "weak",
        };
      })
      .filter((match) => match.score >= minimumScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }

  function moderation(input) {
    const flags = [];
    let score = 100;

    function addFlag(reason, penalty) {
      if (!flags.includes(reason)) {
        flags.push(reason);
        score -= penalty;
      }
    }

    const publicText = [
      input.item,
      input.description,
      input.location,
      input.specificLocation,
      input.brand,
    ]
      .filter(Boolean)
      .join(" ");

    const description = String(input.description || "").trim();

    if (description.length < 20) {
      addFlag("Description is too short to be useful.", 25);
    }

    if (/\b(?:09\d{9}|\+63\s?9\d{9})\b/.test(publicText)) {
      addFlag("Phone number detected in public report text.", 25);
    }

    if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(publicText)) {
      addFlag("Email address detected in public report text.", 25);
    }

    if (/https?:\/\/|www\./i.test(publicText)) {
      addFlag("External link detected in public report text.", 15);
    }

    if (
      /\b(?:password|pin|cvv|otp|passcode|unlock\s+code)\b/i.test(publicText)
    ) {
      addFlag("Sensitive credential wording detected.", 30);
    }

    if (/\b[A-Z]{6,}\b/.test(publicText)) {
      addFlag("Excessive capital-letter wording detected.", 10);
    }

    if (/(.)\1{5,}/i.test(publicText)) {
      addFlag("Repeated characters may indicate spam.", 10);
    }

    if (
      /\b(?:free\s+iphone|click\s+here|dm\s+me|giveaway|scam|joke\s+lang|haha(?:ha){2,})\b/i.test(
        publicText,
      )
    ) {
      addFlag("Possible spam or unserious wording detected.", 25);
    }

    if (/<script|javascript:|onerror\s*=|onclick\s*=/i.test(publicText)) {
      addFlag("Unsafe markup or script-like content detected.", 40);
    }

    const dateValue = input.dateISO || input.dateLost || input.dateFound;

    if (dateValue) {
      const submitted = new Date(`${dateValue}T00:00:00`);
      const tomorrow = new Date();
      tomorrow.setHours(0, 0, 0, 0);
      tomorrow.setDate(tomorrow.getDate() + 1);

      if (!Number.isNaN(submitted.getTime()) && submitted >= tomorrow) {
        addFlag("Report date cannot be in the future.", 30);
      }
    }

    // Simple duplicate-looking report check for the prototype.
    const candidateType = normalize(input.type);
    const candidateItem = normalize(input.item);
    const candidateLocation = normalize(input.location);
    const candidateDate = String(dateValue || "");

    if (candidateType && candidateItem) {
      const possibleDuplicate = read(KEYS.reports).some((report) => {
        const sameType = normalize(report.type) === candidateType;
        const sameItem =
          normalize(report.item) === candidateItem ||
          normalize(report.item).includes(candidateItem) ||
          candidateItem.includes(normalize(report.item));
        const sameLocation =
          candidateLocation &&
          normalize(report.location || report.locationBase).includes(
            candidateLocation,
          );
        const sameDate =
          candidateDate && String(report.dateISO || "") === candidateDate;

        return sameType && sameItem && (sameLocation || sameDate);
      });

      if (possibleDuplicate) {
        addFlag("Possible duplicate-looking report detected.", 15);
      }
    }

    return {
      flags,
      score: Math.max(0, score),
      status: flags.length ? "flagged" : "active",
      autoValidated: flags.length === 0,
      checkedAt: new Date().toISOString(),
    };
  }

  function findReport(reportId) {
    return read(KEYS.reports).find(
      (report) => String(report.id) === String(reportId),
    );
  }

  function upsertReport(updated) {
    const list = read(KEYS.reports);
    const index = list.findIndex(
      (report) => String(report.id) === String(updated.id),
    );

    if (index >= 0) {
      list[index] = updated;
    } else {
      list.unshift(updated);
    }

    write(KEYS.reports, list);
    return updated;
  }

  function updateReport(reportId, patch) {
    const report = findReport(reportId);
    if (!report) return null;

    return upsertReport({
      ...report,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
  }

  function findById(key, recordId) {
    return read(key).find((record) => String(record.id) === String(recordId));
  }

  function updateById(key, recordId, patch) {
    const list = read(key);
    const index = list.findIndex(
      (record) => String(record.id) === String(recordId),
    );

    if (index < 0) return null;

    list[index] = {
      ...list[index],
      ...patch,
      updatedAt: new Date().toISOString(),
    };

    write(key, list);
    return list[index];
  }

  function notify(email, message, link = "") {
    if (!email) return null;

    const list = read(KEYS.notifications);
    const notification = {
      id: id("N"),
      email: normalize(email),
      message,
      link,
      read: false,
      createdAt: new Date().toISOString(),
    };

    list.unshift(notification);
    write(KEYS.notifications, list);
    return notification;
  }

  function participantFromReport(report) {
    return {
      name: report?.reporter?.name || "Reporter",
      email: normalize(report?.reporter?.email),
      mode: report?.reporter?.mode || "guest",
      accessCode: report?.guestAccessCode || "",
    };
  }

  function participantFromClaim(claim) {
    return {
      name: claim?.claimant?.name || "Claimant",
      email: normalize(claim?.claimant?.email),
      mode: claim?.claimant?.mode || "guest",
      accessCode: claim?.guestAccessCode || "",
    };
  }

  function participantFromReturnLead(lead) {
    return {
      name: lead?.finder?.name || "Finder",
      email: normalize(lead?.finder?.email),
      mode: lead?.finder?.mode || "guest",
      accessCode: lead?.guestAccessCode || "",
    };
  }

  function createCaseFromClaim(claimId) {
    const claim = findById(KEYS.claims, claimId);
    if (!claim) return null;

    const existing = read(KEYS.cases).find(
      (item) => String(item.claimId) === String(claimId),
    );
    if (existing) return existing;

    let report = findReport(claim.reportId) || claim.reportSnapshot || null;

    if (!report) return null;

    // Demo/public fixture reports may not exist in act_reports yet.
    // Store a copy once the workflow needs a persistent linked record.
    if (!findReport(report.id)) {
      report = upsertReport({
        ...report,
        status: report.status || "active",
        createdAt: report.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    const returnCase = {
      id: id("RC"),
      reportId: report.id,
      item: report.item || "Item",
      claimId: claim.id,
      returnLeadId: null,
      source: "claim",
      status: "coordinating",
      returnCode: code(6),
      owner: participantFromClaim(claim),
      finder: participantFromReport(report),
      messages: [
        {
          id: id("M"),
          senderRole: "admin",
          senderName: "ACT Moderator",
          text: "The ownership claim was verified. Use this secure thread to coordinate the return. Do not share sensitive information.",
          createdAt: new Date().toISOString(),
        },
      ],
      confirmations: {
        owner: false,
        finder: false,
        admin: false,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const cases = read(KEYS.cases);
    cases.unshift(returnCase);
    write(KEYS.cases, cases);

    updateById(KEYS.claims, claim.id, {
      status: "verified",
      returnCaseId: returnCase.id,
    });

    updateReport(report.id, {
      status: "claim_requested",
    });

    if (returnCase.owner.mode === "user") {
      notify(
        returnCase.owner.email,
        `Your claim for ${report.item} was verified. Return coordination is now open.`,
        `return-coordination.html?case=${encodeURIComponent(returnCase.id)}`,
      );
    }

    if (returnCase.finder.mode === "user") {
      notify(
        returnCase.finder.email,
        `A verified owner was found for ${report.item}. Return coordination is now open.`,
        `return-coordination.html?case=${encodeURIComponent(returnCase.id)}`,
      );
    }

    return returnCase;
  }

  function createCaseFromReturnLead(returnLeadId) {
    const lead = findById(KEYS.returns, returnLeadId);
    if (!lead) return null;

    const existing = read(KEYS.cases).find(
      (item) => String(item.returnLeadId) === String(returnLeadId),
    );
    if (existing) return existing;

    let report = findReport(lead.reportId) || lead.reportSnapshot || null;

    if (!report) return null;

    if (!findReport(report.id)) {
      report = upsertReport({
        ...report,
        status: report.status || "active",
        createdAt: report.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    const returnCase = {
      id: id("RC"),
      reportId: report.id,
      item: report.item || "Item",
      claimId: null,
      returnLeadId: lead.id,
      source: "return_lead",
      status: "coordinating",
      returnCode: code(6),
      owner: participantFromReport(report),
      finder: participantFromReturnLead(lead),
      messages: [
        {
          id: id("M"),
          senderRole: "admin",
          senderName: "ACT Moderator",
          text: "This return lead was accepted. Use this secure thread to coordinate the handoff. Do not share sensitive information.",
          createdAt: new Date().toISOString(),
        },
      ],
      confirmations: {
        owner: false,
        finder: false,
        admin: false,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const cases = read(KEYS.cases);
    cases.unshift(returnCase);
    write(KEYS.cases, cases);

    updateById(KEYS.returns, lead.id, {
      status: "coordinating",
      returnCaseId: returnCase.id,
    });

    updateReport(report.id, {
      status: "claim_requested",
    });

    if (returnCase.owner.mode === "user") {
      notify(
        returnCase.owner.email,
        `Someone reported finding ${report.item}. Return coordination is now open.`,
        `return-coordination.html?case=${encodeURIComponent(returnCase.id)}`,
      );
    }

    if (returnCase.finder.mode === "user") {
      notify(
        returnCase.finder.email,
        `Your return lead for ${report.item} was accepted.`,
        `return-coordination.html?case=${encodeURIComponent(returnCase.id)}`,
      );
    }

    return returnCase;
  }

  function findCase(caseId) {
    return findById(KEYS.cases, caseId);
  }

  function saveCase(updated) {
    return updateById(KEYS.cases, updated.id, updated);
  }

  function addMessage(caseId, senderRole, senderName, text) {
    const record = findCase(caseId);
    if (!record) return null;

    const message = {
      id: id("M"),
      senderRole,
      senderName,
      text: String(text || "").trim(),
      createdAt: new Date().toISOString(),
    };

    if (!message.text) return record;

    return updateById(KEYS.cases, caseId, {
      messages: [...(record.messages || []), message],
    });
  }

  function confirmReturn(caseId, role) {
    const record = findCase(caseId);
    if (!record) return null;

    const confirmations = {
      owner: Boolean(record.confirmations?.owner),
      finder: Boolean(record.confirmations?.finder),
      admin: Boolean(record.confirmations?.admin),
    };

    if (role === "owner") confirmations.owner = true;
    if (role === "finder") confirmations.finder = true;
    if (role === "admin") confirmations.admin = true;

    const completed =
      confirmations.admin || (confirmations.owner && confirmations.finder);

    const updated = updateById(KEYS.cases, caseId, {
      confirmations,
      status: completed ? "returned" : "pending_confirmation",
    });

    if (completed) {
      updateReport(record.reportId, {
        status: "returned",
      });

      if (record.claimId) {
        updateById(KEYS.claims, record.claimId, {
          status: "completed",
        });
      }

      if (record.returnLeadId) {
        updateById(KEYS.returns, record.returnLeadId, {
          status: "resolved",
        });
      }

      [record.owner, record.finder].forEach((participant) => {
        if (participant?.mode === "user") {
          notify(
            participant.email,
            "The return has been confirmed and the item is now marked Returned.",
            `return-coordination.html?case=${encodeURIComponent(caseId)}`,
          );
        }
      });
    }

    return updated;
  }

  function rememberGuestCase(referenceId, accessCode, kind = "case") {
    if (!referenceId || !accessCode) return null;

    const list = read(KEYS.guestCases);
    const ref = String(referenceId);

    const updated = [
      {
        referenceId: ref,
        accessCode: String(accessCode),
        kind,
        lastOpenedAt: new Date().toISOString(),
      },
      ...list.filter((item) => String(item.referenceId) !== ref),
    ].slice(0, 8);

    write(KEYS.guestCases, updated);
    return updated[0];
  }

  function recentGuestCases() {
    const remembered = read(KEYS.guestCases);

    const discovered = [
      ...read(KEYS.reports)
        .filter(
          (item) => item.guestAccessCode && item.reporter?.mode === "guest",
        )
        .map((item) => ({
          referenceId: item.id,
          accessCode: item.guestAccessCode,
          kind: `${item.type || "report"}-report`,
          lastOpenedAt:
            item.updatedAt || item.createdAt || new Date(0).toISOString(),
        })),

      ...read(KEYS.claims)
        .filter(
          (item) => item.guestAccessCode && item.claimant?.mode === "guest",
        )
        .map((item) => ({
          referenceId: item.id,
          accessCode: item.guestAccessCode,
          kind: "claim",
          lastOpenedAt:
            item.updatedAt || item.createdAt || new Date(0).toISOString(),
        })),

      ...read(KEYS.returns)
        .filter((item) => item.guestAccessCode && item.finder?.mode === "guest")
        .map((item) => ({
          referenceId: item.id,
          accessCode: item.guestAccessCode,
          kind: "return-lead",
          lastOpenedAt:
            item.updatedAt || item.createdAt || new Date(0).toISOString(),
        })),
    ];

    const merged = new Map();

    [...discovered, ...remembered].forEach((item) => {
      if (!item?.referenceId || !item?.accessCode) return;
      merged.set(String(item.referenceId), item);
    });

    return Array.from(merged.values())
      .sort(
        (a, b) => new Date(b.lastOpenedAt || 0) - new Date(a.lastOpenedAt || 0),
      )
      .slice(0, 8);
  }

  function guestMatch(record, enteredCode) {
    return (
      record &&
      record.guestAccessCode &&
      String(record.guestAccessCode) === String(enteredCode)
    );
  }

  window.ACTWorkflow = {
    KEYS,
    read,
    write,
    pullFromCloud,
    syncAllFromCloud,
    id,
    code,
    normalize,
    moderation,
    matchScore,
    possibleMatches,
    findReport,
    upsertReport,
    updateReport,
    findById,
    updateById,
    notify,
    createCaseFromClaim,
    createCaseFromReturnLead,
    findCase,
    saveCase,
    addMessage,
    confirmReturn,
    rememberGuestCase,
    recentGuestCases,
    guestMatch,
  };

  (async function syncCloudOnPageLoad() {
    try {
      await ensureSupabase();

      const changed = await syncAllFromCloud();

      if (changed) {
        location.reload();
      }
    } catch (error) {
      console.error("Initial cloud sync failed:", error);
    }
  })();
})();
