const configs = {
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
    values: (body) => [
      body.name,
      body.email,
      body.goal,
      body.status || 'Ativo',
      body.assessmentDate || null,
    ],
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
    values: (body) => [body.name, body.group, body.equipment, body.instructions || null],
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
    values: (body) => [body.student, body.name, body.goal, body.duration],
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
    values: (body) => [
      body.student,
      body.weight,
      body.fat || null,
      body.waist || null,
      body.notes || null,
    ],
    updateValues: (body) => [body.weight, body.fat || null, body.waist || null, body.notes || null],
  },
}

export async function listResource(db, resource, trainerId) {
  const config = configs[resource]
  if (!config) return null
  return (await db.query(config.select, [trainerId])).rows
}

export async function createResource(db, resource, trainerId, body) {
  const config = configs[resource]
  if (!config) return null
  return (await db.query(config.insert, [trainerId, ...config.values(body)])).rows[0]
}

export async function updateResource(db, resource, trainerId, id, body) {
  const config = configs[resource]
  if (!config) return null
  return (
    await db.query(config.update, [
      trainerId,
      id,
      ...(config.updateValues?.(body) || config.values(body)),
    ])
  ).rows[0]
}

export async function deleteResource(db, resource, trainerId, id) {
  if (!configs[resource]) return null
  return db.query(`DELETE FROM ${resource} WHERE id=$1 AND trainer_id=$2`, [id, trainerId])
}
