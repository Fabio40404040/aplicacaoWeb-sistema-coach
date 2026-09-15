var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/lib/db.js
function prepare(binding, sql, values = []) {
  const parameters = [];
  const statement = sql.replace(/\$(\d+)/gu, (_, index) => {
    parameters.push(values[Number(index) - 1] ?? null);
    return "?";
  });
  const prepared = binding.prepare(statement);
  return parameters.length ? prepared.bind(...parameters) : prepared;
}
__name(prepare, "prepare");
async function withDb(env, callback) {
  if (!env.DB) throw new Error("Cloudflare D1 binding DB is missing");
  return callback({
    async query(sql, values) {
      const result = await prepare(env.DB, sql, values).all();
      return { rows: result.results || [] };
    },
    async batch(queries) {
      const results = await env.DB.batch(
        queries.map(({ sql, values }) => prepare(env.DB, sql, values))
      );
      return results.map((result) => ({ rows: result.results || [] }));
    }
  });
}
__name(withDb, "withDb");

// src/lib/http.js
function json(data, status = 200, headers = {}) {
  return new Response(data === null ? null : JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers }
  });
}
__name(json, "json");
function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const allowed = env.ALLOWED_ORIGIN === "*" || origin === env.ALLOWED_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowed ? origin || env.ALLOWED_ORIGIN : env.ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin"
  };
}
__name(corsHeaders, "corsHeaders");
async function readJson(request) {
  const type = request.headers.get("Content-Type") || "";
  if (!type.includes("application/json")) throw new Error("Envie o corpo como JSON.");
  return request.json();
}
__name(readJson, "readJson");

// src/lib/session.js
var encoder = new TextEncoder();
var decoder = new TextDecoder();
function isStrongPassword(password) {
  return typeof password === "string" && password.length >= 8 && password.length <= 128 && /[a-z]/u.test(password) && /[A-Z]/u.test(password) && /[0-9]/u.test(password) && /[^A-Za-z0-9\s]/u.test(password) && !/\s/u.test(password);
}
__name(isStrongPassword, "isStrongPassword");
function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}
__name(base64url, "base64url");
function decodeBase64url(value) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  return Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
}
__name(decodeBase64url, "decodeBase64url");
async function signature(payload, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return base64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload))));
}
__name(signature, "signature");
async function createSession(trainer, env, role = "coach") {
  const expiresAt = Math.floor(Date.now() / 1e3) + Number(env.SESSION_TTL_SECONDS || 43200);
  const payload = base64url(
    encoder.encode(
      JSON.stringify({
        sub: trainer.id,
        email: trainer.email,
        role,
        version: trainer.auth_version || 0,
        exp: expiresAt
      })
    )
  );
  return `${payload}.${await signature(payload, env.SESSION_SECRET)}`;
}
__name(createSession, "createSession");
async function readSession(request, env) {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/u, "");
  if (!token) return null;
  const [payload, suppliedSignature] = token.split(".");
  if (!payload || !suppliedSignature || await signature(payload, env.SESSION_SECRET) !== suppliedSignature)
    return null;
  const session = JSON.parse(decoder.decode(decodeBase64url(payload)));
  return session.exp > Math.floor(Date.now() / 1e3) ? session : null;
}
__name(readSession, "readSession");
async function verifyPassword(password, encodedHash) {
  const [scheme, iterations, salt, expected] = encodedHash.split("$");
  if (scheme !== "pbkdf2" || !iterations || !salt || !expected) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
    "deriveBits"
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: decodeBase64url(salt),
      iterations: Number(iterations)
    },
    key,
    256
  );
  return base64url(new Uint8Array(bits)) === expected;
}
__name(verifyPassword, "verifyPassword");
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = 1e5;
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
    "deriveBits"
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256
  );
  return `pbkdf2$${iterations}$${base64url(salt)}$${base64url(new Uint8Array(bits))}`;
}
__name(hashPassword, "hashPassword");

// src/routes/auth.js
async function login(request, env, db) {
  const { email, password } = await readJson(request);
  if (typeof email !== "string" || typeof password !== "string")
    return { error: "Credenciais inv\xE1lidas.", status: 400 };
  const result = await db.query(
    "SELECT id, name, email, password_hash FROM trainers WHERE lower(email) = lower($1) LIMIT 1",
    [email.trim()]
  );
  const trainer = result.rows[0];
  if (!trainer || !await verifyPassword(password, trainer.password_hash))
    return { error: "E-mail ou senha incorretos.", status: 401 };
  return {
    data: {
      token: await createSession(trainer, env),
      user: { id: trainer.id, name: trainer.name, email: trainer.email }
    }
  };
}
__name(login, "login");

// src/routes/student-auth.js
async function studentAuth(request, env, db, action) {
  const body = await readJson(request);
  const { email, password, name } = body || {};
  if (typeof email !== "string" || email.length > 180 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email.trim()) || typeof password !== "string" || password.length > 128 || password.length < 8) {
    return { error: "Informe um e-mail v\xE1lido e uma senha de 8 a 128 caracteres.", status: 400 };
  }
  let account;
  if (action === "register") {
    if (!isStrongPassword(password))
      return {
        error: "A senha deve ter no m\xEDnimo 8 caracteres, com mai\xFAscula, min\xFAscula, n\xFAmero e caractere especial.",
        status: 400
      };
    if (typeof name !== "string" || name.trim().length < 3 || name.trim().length > 140)
      return { error: "Informe seu nome completo.", status: 400 };
    const result = await db.query(
      "INSERT INTO student_accounts (name, email, password_hash) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING id, name, email",
      [name.trim(), email.trim().toLowerCase(), await hashPassword(password)]
    );
    account = result.rows[0];
    if (!account)
      return {
        error: "Este e-mail j\xE1 est\xE1 cadastrado. Entre na sua conta ou recupere sua senha.",
        status: 409
      };
  } else {
    const result = await db.query(
      "SELECT id, name, email, password_hash, auth_version FROM student_accounts WHERE lower(email) = lower($1) LIMIT 1",
      [email.trim()]
    );
    account = result.rows[0];
    if (!account || !await verifyPassword(password, account.password_hash))
      return { error: "E-mail ou senha incorretos.", status: 401 };
  }
  return {
    data: {
      token: await createSession(account, env, "student"),
      user: { id: account.id, name: account.name, email: account.email }
    },
    status: action === "register" ? 201 : 200
  };
}
__name(studentAuth, "studentAuth");

// src/lib/password-mailer.js
async function sendPasswordReset(env, message) {
  await env.EMAIL.send({
    to: message.to,
    from: { email: env.EMAIL_FROM, name: "FRS Coach" },
    subject: "Redefina sua senha \xB7 FRS Coach",
    text: `Acesse ${message.link} para redefinir sua senha. O link vale por 30 minutos. Se voc\xEA n\xE3o solicitou, ignore esta mensagem.`
  });
}
__name(sendPasswordReset, "sendPasswordReset");

// src/routes/student-recovery.js
var generic = {
  data: {
    message: "Se houver uma conta habilitada para teste com esse e-mail, voc\xEA receber\xE1 um link de recupera\xE7\xE3o. Confira tamb\xE9m o spam."
  }
};
var hex = /* @__PURE__ */ __name((bytes) => Array.from(bytes, (n) => n.toString(16).padStart(2, "0")).join(""), "hex");
var digest = /* @__PURE__ */ __name(async (text) => hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))), "digest");
async function studentRecovery(request, env, db, action, deliver = sendPasswordReset) {
  const body = await readJson(request);
  if (action === "reset") {
    const { token: token2, password } = body || {};
    if (typeof token2 !== "string" || !/^[a-f0-9]{64}$/u.test(token2) || !isStrongPassword(password))
      return {
        error: "Use um link v\xE1lido e uma senha com mai\xFAscula, min\xFAscula, n\xFAmero e caractere especial.",
        status: 400
      };
    const hashed = await hashPassword(password);
    const tokenHash2 = await digest(token2);
    const [result2] = await db.batch([
      {
        sql: `UPDATE student_accounts SET password_hash = $2, auth_version = auth_version + 1
        WHERE id IN (SELECT account_id FROM student_password_resets WHERE token_hash = $1 AND expires_at > CURRENT_TIMESTAMP) RETURNING id`,
        values: [tokenHash2, hashed]
      },
      { sql: "DELETE FROM student_password_resets WHERE token_hash = $1", values: [tokenHash2] }
    ]);
    if (!result2.rows.length)
      return { error: "Este link expirou ou j\xE1 foi usado. Solicite outro.", status: 400 };
    return { data: { message: "Senha alterada. Voc\xEA j\xE1 pode entrar com a nova senha." } };
  }
  const email = body?.email;
  if (typeof email !== "string" || email.length > 180 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email.trim()))
    return { error: "Informe um e-mail v\xE1lido.", status: 400 };
  const testEmails = new Set(
    (env.RECOVERY_TEST_EMAILS || "").split(",").map((address) => address.trim().toLowerCase()).filter(Boolean)
  );
  if (!env.EMAIL?.send || !env.EMAIL_FROM || !env.PUBLIC_SITE_URL || !testEmails.size)
    return {
      error: "A recupera\xE7\xE3o por e-mail ainda n\xE3o est\xE1 dispon\xEDvel. Entre em contato com o treinador.",
      status: 503
    };
  const result = await db.query(
    "SELECT id, email FROM student_accounts WHERE lower(email) = lower($1) LIMIT 1",
    [email.trim()]
  );
  const account = result.rows[0];
  if (!account || !testEmails.has(account.email.trim().toLowerCase())) return generic;
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await digest(token);
  const inserted = await db.query(
    `INSERT INTO student_password_resets (account_id, token_hash, expires_at)
    VALUES ($1, $2, datetime('now', '+30 minutes'))
    ON CONFLICT (account_id) DO UPDATE SET token_hash = EXCLUDED.token_hash, expires_at = EXCLUDED.expires_at, requested_at = CURRENT_TIMESTAMP
    WHERE student_password_resets.requested_at < datetime('now', '-2 minutes') RETURNING account_id`,
    [account.id, tokenHash]
  );
  if (!inserted.rows.length) return generic;
  const link = new URL(env.PUBLIC_SITE_URL);
  link.hash = `nova-senha?token=${token}`;
  try {
    await deliver(env, { to: account.email, link: link.href });
  } catch {
    await db.query(
      "DELETE FROM student_password_resets WHERE account_id = $1 AND token_hash = $2",
      [account.id, tokenHash]
    );
    return {
      error: "N\xE3o foi poss\xEDvel enviar a recupera\xE7\xE3o agora. Tente novamente mais tarde.",
      status: 503
    };
  }
  return generic;
}
__name(studentRecovery, "studentRecovery");

// src/routes/dashboard.js
async function dashboard(db, trainerId) {
  const [students, exercises, workouts, assessments] = await Promise.all([
    db.query(
      `SELECT s.id,
      s.name,
      s.email,
      s.goal,
      s.status,
      s.assessment_date AS "assessmentDate",
      COALESCE((SELECT name
      FROM workouts
      WHERE student_id=s.id AND trainer_id=s.trainer_id
      ORDER BY created_at DESC LIMIT 1),
      'Aguardando ficha') AS workout,
      'Atividade recente' AS activity
      FROM students s
      WHERE s.trainer_id=$1
      ORDER BY s.created_at DESC`,
      [trainerId]
    ),
    db.query(
      `SELECT id,
      name,
      muscle_group AS "group",
      equipment,
      instructions
      FROM exercises
      WHERE trainer_id=$1
      ORDER BY created_at DESC`,
      [trainerId]
    ),
    db.query(
      `SELECT w.id,
      w.name,
      s.name AS student,
      w.goal,
      w.duration,
      w.progress
      FROM workouts w
      JOIN students s ON s.id=w.student_id
      WHERE w.trainer_id=$1
      ORDER BY w.created_at DESC`,
      [trainerId]
    ),
    db.query(
      `SELECT a.id,
      s.name AS student,
      strftime('%d/%m/%Y',
      a.assessed_at) AS date,
      a.weight_kg || ' kg' AS weight,
      a.body_fat_percent || '%' AS fat,
      a.waist_cm || ' cm' AS waist
      FROM assessments a
      JOIN students s ON s.id=a.student_id
      WHERE a.trainer_id=$1
      ORDER BY a.assessed_at DESC`,
      [trainerId]
    )
  ]);
  return {
    students: students.rows,
    exercises: exercises.rows,
    workouts: workouts.rows,
    assessments: assessments.rows
  };
}
__name(dashboard, "dashboard");

// src/routes/resources.js
var configs = {
  students: {
    select: `SELECT id,
      name,
      email,
      goal,
      status,
      assessment_date AS "assessmentDate"
      FROM students
      WHERE trainer_id = $1
      ORDER BY created_at DESC`,
    insert: `INSERT INTO students (trainer_id,
      name,
      email,
      goal,
      status,
      assessment_date)
      VALUES ($1,
      $2,
      $3,
      $4,
      $5,
      $6)
      RETURNING id,
      name,
      email,
      goal,
      status,
      assessment_date AS "assessmentDate"`,
    update: `UPDATE students
      SET name=$3,
      email=$4,
      goal=$5,
      status=$6,
      assessment_date=$7
      WHERE id=$2 AND trainer_id=$1
      RETURNING id`,
    values: /* @__PURE__ */ __name((body) => [
      body.name,
      body.email,
      body.goal,
      body.status || "Ativo",
      body.assessmentDate || null
    ], "values")
  },
  exercises: {
    select: `SELECT id,
      name,
      muscle_group AS "group",
      equipment,
      instructions
      FROM exercises
      WHERE trainer_id = $1
      ORDER BY created_at DESC`,
    insert: `INSERT INTO exercises (trainer_id,
      name,
      muscle_group,
      equipment,
      instructions)
      VALUES ($1,
      $2,
      $3,
      $4,
      $5)
      RETURNING id,
      name,
      muscle_group AS "group",
      equipment,
      instructions`,
    update: `UPDATE exercises
      SET name=$3,
      muscle_group=$4,
      equipment=$5,
      instructions=$6
      WHERE id=$2 AND trainer_id=$1
      RETURNING id`,
    values: /* @__PURE__ */ __name((body) => [body.name, body.group, body.equipment, body.instructions || null], "values")
  },
  workouts: {
    select: `SELECT w.id,
      w.name,
      s.name AS student,
      w.goal,
      w.duration,
      w.progress
      FROM workouts w
      JOIN students s ON s.id=w.student_id
      WHERE w.trainer_id=$1
      ORDER BY w.created_at DESC`,
    insert: `INSERT INTO workouts (trainer_id,
      student_id,
      name,
      goal,
      duration)
      VALUES ($1,
      (SELECT id
      FROM students
      WHERE trainer_id=$1 AND name=$2 LIMIT 1),
      $3,
      $4,
      $5)
      RETURNING id,
      name,
      goal,
      duration,
      progress`,
    update: `UPDATE workouts
      SET student_id=(SELECT id
      FROM students
      WHERE trainer_id=$1 AND name=$3 LIMIT 1),
      name=$4,
      goal=$5,
      duration=$6
      WHERE id=$2 AND trainer_id=$1
      RETURNING id`,
    values: /* @__PURE__ */ __name((body) => [body.student, body.name, body.goal, body.duration], "values")
  },
  assessments: {
    select: `SELECT a.id,
      s.name AS student,
      strftime('%d/%m/%Y',
      a.assessed_at) AS date,
      a.weight_kg || ' kg' AS weight,
      a.body_fat_percent || '%' AS fat,
      a.waist_cm || ' cm' AS waist
      FROM assessments a
      JOIN students s ON s.id=a.student_id
      WHERE a.trainer_id=$1
      ORDER BY a.assessed_at DESC`,
    insert: `INSERT INTO assessments (trainer_id,
      student_id,
      weight_kg,
      body_fat_percent,
      waist_cm,
      notes)
      VALUES ($1,
      (SELECT id
      FROM students
      WHERE trainer_id=$1 AND name=$2 LIMIT 1),
      $3,
      $4,
      $5,
      $6)
      RETURNING id`,
    update: `UPDATE assessments
      SET weight_kg=$3,
      body_fat_percent=$4,
      waist_cm=$5,
      notes=$6
      WHERE id=$2 AND trainer_id=$1
      RETURNING id`,
    values: /* @__PURE__ */ __name((body) => [
      body.student,
      body.weight,
      body.fat || null,
      body.waist || null,
      body.notes || null
    ], "values"),
    updateValues: /* @__PURE__ */ __name((body) => [body.weight, body.fat || null, body.waist || null, body.notes || null], "updateValues")
  }
};
async function listResource(db, resource, trainerId) {
  const config = configs[resource];
  if (!config) return null;
  return (await db.query(config.select, [trainerId])).rows;
}
__name(listResource, "listResource");
async function createResource(db, resource, trainerId, body) {
  const config = configs[resource];
  if (!config) return null;
  return (await db.query(config.insert, [trainerId, ...config.values(body)])).rows[0];
}
__name(createResource, "createResource");
async function updateResource(db, resource, trainerId, id, body) {
  const config = configs[resource];
  if (!config) return null;
  return (await db.query(config.update, [
    trainerId,
    id,
    ...config.updateValues?.(body) || config.values(body)
  ])).rows[0];
}
__name(updateResource, "updateResource");
async function deleteResource(db, resource, trainerId, id) {
  if (!configs[resource]) return null;
  return db.query(`DELETE FROM ${resource} WHERE id=$1 AND trainer_id=$2`, [id, trainerId]);
}
__name(deleteResource, "deleteResource");

// src/index.js
async function handle(request, env) {
  const url = new URL(request.url);
  const segments = url.pathname.replace(/^\/api\/?/u, "").split("/").filter(Boolean);
  if (request.method === "POST" && ["student/auth/forgot", "student/auth/reset"].includes(segments.join("/"))) {
    return withDb(env, (db) => studentRecovery(request, env, db, segments[2]));
  }
  if (request.method === "POST" && segments.join("/") === "auth/login") {
    return withDb(env, async (db) => login(request, env, db));
  }
  if (request.method === "POST" && ["student/auth/login", "student/auth/register"].includes(segments.join("/"))) {
    return withDb(env, (db) => studentAuth(request, env, db, segments[2]));
  }
  const session = await readSession(request, env);
  if (!session) return { error: "Sess\xE3o inv\xE1lida ou expirada.", status: 401 };
  if (segments[0] === "student") {
    if (session.role !== "student") return { error: "Use sua conta de aluno.", status: 403 };
    if (request.method !== "GET" || segments.join("/") !== "student/me")
      return { error: "Rota n\xE3o encontrada.", status: 404 };
    return withDb(env, async (db) => {
      const result = await db.query(
        "SELECT id, name, email FROM student_accounts WHERE id = $1 AND auth_version = $2",
        [session.sub, session.version || 0]
      );
      return result.rows[0] ? { data: result.rows[0] } : { error: "Conta n\xE3o encontrada.", status: 401 };
    });
  }
  if (session.role !== "coach")
    return { error: "Acesso exclusivo do personal trainer.", status: 403 };
  return withDb(env, async (db) => {
    if (request.method === "GET" && segments[0] === "dashboard")
      return { data: await dashboard(db, session.sub) };
    const [resource, id] = segments;
    if (request.method === "GET" && !id)
      return { data: await listResource(db, resource, session.sub) };
    if (request.method === "POST" && !id)
      return {
        data: await createResource(db, resource, session.sub, await readJson(request)),
        status: 201
      };
    if (request.method === "PUT" && id)
      return { data: await updateResource(db, resource, session.sub, id, await readJson(request)) };
    if (request.method === "DELETE" && id) {
      await deleteResource(db, resource, session.sub, id);
      return { data: null, status: 204 };
    }
    return { error: "Rota n\xE3o encontrada.", status: 404 };
  });
}
__name(handle, "handle");
var index_default = {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    try {
      const result = await handle(request, env);
      if (result?.error) return json({ error: result.error }, result.status || 400, cors);
      return json(result?.data ?? null, result?.status || 200, cors);
    } catch (error) {
      console.error(error);
      return json({ error: "N\xE3o foi poss\xEDvel concluir a solicita\xE7\xE3o." }, 500, cors);
    }
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
