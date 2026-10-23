require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');

const app = express();
app.use(express.json());

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'almoxarifado',
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true
});

function validDateRange(req, res, next) {
  const { inicio, fim } = req.query;
  if (!inicio || !fim || !/^\d{4}-\d{2}-\d{2}$/.test(inicio) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(fim) || inicio > fim) {
    return res.status(400).json({ erro: 'Informe inicio e fim válidos (AAAA-MM-DD), com inicio <= fim.' });
  }
  next();
}

app.get('/', (_req, res) => res.json({ servico: 'API Almoxarifado', sucesso: true }));

app.get('/produtos', async (_req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM produtos ORDER BY nome');
    res.json(rows);
  } catch (e) { next(e); }
});

app.post('/produtos', async (req, res, next) => {
  try {
    const { nome, categoria, unidade_medida, quantidade = 0, valor_unitario } = req.body;
    if (!String(nome || '').trim()) return res.status(400).json({ erro: 'Nome é obrigatório.' });
    if (!String(categoria || '').trim()) return res.status(400).json({ erro: 'Categoria é obrigatória.' });
    if (!String(unidade_medida || '').trim()) return res.status(400).json({ erro: 'Unidade de medida é obrigatória.' });
    if (!Number.isInteger(Number(quantidade)) || Number(quantidade) < 0)
      return res.status(400).json({ erro: 'Quantidade deve ser um inteiro não negativo.' });
    if (!Number.isFinite(Number(valor_unitario)) || Number(valor_unitario) <= 0)
      return res.status(400).json({ erro: 'Valor unitário deve ser maior que zero.' });
    const [result] = await pool.execute(
      'INSERT INTO produtos (nome, categoria, unidade_medida, quantidade, valor_unitario) VALUES (?, ?, ?, ?, ?)',
      [String(nome).trim(), String(categoria).trim(), String(unidade_medida).trim(), Number(quantidade), Number(valor_unitario)]
    );
    res.status(201).json({ mensagem: 'Produto cadastrado.', id_produto: result.insertId });
  } catch (e) { next(e); }
});

app.get('/saidas', async (_req, res, next) => {
  try {
    const [rows] = await pool.query(`SELECT s.id_saida, p.nome, s.quantidade, s.data_saida, s.valor_unitario,
      s.quantidade * s.valor_unitario AS valor_total
      FROM saidas s JOIN produtos p ON p.id_produto = s.id_produto
      ORDER BY s.data_saida DESC, s.id_saida DESC`);
    res.json(rows);
  } catch (e) { next(e); }
});

app.post('/entradas', async (req, res, next) => {
  const { id_produto, quantidade, valor_unitario, data_entrada } = req.body;
  if (!Number.isInteger(Number(id_produto)) || Number(id_produto) <= 0 ||
      !Number.isInteger(Number(quantidade)) || Number(quantidade) <= 0 ||
      !Number.isFinite(Number(valor_unitario)) || Number(valor_unitario) <= 0 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(String(data_entrada || ''))) {
    return res.status(400).json({ erro: 'Informe id_produto, quantidade positiva, valor_unitario positivo e data_entrada AAAA-MM-DD.' });
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [products] = await conn.execute('SELECT id_produto FROM produtos WHERE id_produto = ? FOR UPDATE', [Number(id_produto)]);
    if (!products.length) { await conn.rollback(); return res.status(404).json({ erro: 'Produto não encontrado.' }); }
    const [result] = await conn.execute(
      'INSERT INTO entradas (id_produto, data_entrada, quantidade, valor_unitario) VALUES (?, ?, ?, ?)',
      [Number(id_produto), data_entrada, Number(quantidade), Number(valor_unitario)]
    );
    await conn.execute('UPDATE produtos SET quantidade = quantidade + ? WHERE id_produto = ?', [Number(quantidade), Number(id_produto)]);
    await conn.commit();
    res.status(201).json({ mensagem: 'Entrada registrada e saldo atualizado.', id_entrada: result.insertId });
  } catch (e) { await conn.rollback(); next(e); }
  finally { conn.release(); }
});

app.post('/saidas', async (req, res, next) => {
  const { id_produto, quantidade, data_saida } = req.body;
  if (!Number.isInteger(Number(id_produto)) || Number(id_produto) <= 0 ||
      !Number.isInteger(Number(quantidade)) || Number(quantidade) <= 0 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(String(data_saida || ''))) {
    return res.status(400).json({ erro: 'Informe id_produto, quantidade positiva e data_saida AAAA-MM-DD.' });
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [products] = await conn.execute(
      'SELECT quantidade, valor_unitario FROM produtos WHERE id_produto = ? FOR UPDATE', [Number(id_produto)]
    );
    if (!products.length) { await conn.rollback(); return res.status(404).json({ erro: 'Produto não encontrado.' }); }
    const p = products[0];
    if (p.quantidade < Number(quantidade)) {
      await conn.rollback();
      return res.status(400).json({ erro: 'Estoque insuficiente.', saldo_atual: p.quantidade });
    }
    const [result] = await conn.execute(
      'INSERT INTO saidas (id_produto, data_saida, quantidade, valor_unitario) VALUES (?, ?, ?, ?)',
      [Number(id_produto), data_saida, Number(quantidade), Number(p.valor_unitario)]
    );
    await conn.execute('UPDATE produtos SET quantidade = quantidade - ? WHERE id_produto = ?', [Number(quantidade), Number(id_produto)]);
    await conn.commit();
    res.status(201).json({ mensagem: 'Saída registrada e saldo atualizado.', id_saida: result.insertId });
  } catch (e) { await conn.rollback(); next(e); }
  finally { conn.release(); }
});

app.get('/relatorios/categorias', async (_req, res, next) => {
  try {
    const [rows] = await pool.query(`SELECT categoria,
      SUM(quantidade * valor_unitario) AS valor_total
      FROM produtos GROUP BY categoria ORDER BY categoria`);
    res.json(rows);
  } catch (e) { next(e); }
});

app.get('/relatorios/movimentacoes', validDateRange, async (req, res, next) => {
  try {
    const { inicio, fim } = req.query;
    const [rows] = await pool.execute(`
      SELECT p.nome AS nome_produto, p.unidade_medida,
        COALESCE(e.total_entradas, 0) AS total_entradas,
        COALESCE(s.total_saidas, 0) AS total_saidas,
        COALESCE(e.total_entradas, 0) - COALESCE(s.total_saidas, 0) AS saldo_no_periodo,
        COALESCE(e.valor_entradas, 0) AS valor_financeiro_entradas,
        COALESCE(s.valor_saidas, 0) AS valor_financeiro_saidas
      FROM produtos p
      LEFT JOIN (
        SELECT id_produto, SUM(quantidade) total_entradas,
          SUM(quantidade * valor_unitario) valor_entradas
        FROM entradas WHERE data_entrada BETWEEN ? AND ? GROUP BY id_produto
      ) e ON e.id_produto = p.id_produto
      LEFT JOIN (
        SELECT id_produto, SUM(quantidade) total_saidas,
          SUM(quantidade * valor_unitario) valor_saidas
        FROM saidas WHERE data_saida BETWEEN ? AND ? GROUP BY id_produto
      ) s ON s.id_produto = p.id_produto
      ORDER BY p.nome`, [inicio, fim, inicio, fim]);
    res.json(rows);
  } catch (e) { next(e); }
});

app.get('/relatorios/maiores-saidas', validDateRange, async (req, res, next) => {
  try {
    const [rows] = await pool.execute(`
      SELECT p.nome AS nome_produto,
        SUM(s.quantidade) AS quantidade_total_saida,
        SUM(s.quantidade * s.valor_unitario) AS valor_total_financeiro_saidas
      FROM saidas s JOIN produtos p ON p.id_produto = s.id_produto
      WHERE s.data_saida BETWEEN ? AND ?
      GROUP BY p.id_produto, p.nome
      ORDER BY quantidade_total_saida DESC, p.nome`, [req.query.inicio, req.query.fim]);
    res.json(rows);
  } catch (e) { next(e); }
});

app.get('/relatorios/limites', async (_req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT id_produto, nome, quantidade,
        CASE WHEN quantidade = 0 THEN 'Mínimo atingido'
             WHEN quantidade = 100 THEN 'Máximo atingido' END AS situacao,
        quantidade AS percentual_nivel
      FROM produtos WHERE quantidade IN (0, 100) ORDER BY nome`);
    res.json(rows);
  } catch (e) { next(e); }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ erro: 'Erro interno do servidor.' });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`API Almoxarifado rodando em http://localhost:${port}`));
