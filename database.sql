CREATE DATABASE IF NOT EXISTS almoxarifado;
USE almoxarifado;

CREATE TABLE IF NOT EXISTS produtos (
    id_produto INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    categoria VARCHAR(60) NOT NULL,
    unidade_medida VARCHAR(20) NOT NULL,
    quantidade INT NOT NULL DEFAULT 0,
    valor_unitario DECIMAL(10,2) NOT NULL,
    CONSTRAINT chk_produto_quantidade CHECK (quantidade >= 0),
    CONSTRAINT chk_produto_valor CHECK (valor_unitario > 0)
);

CREATE TABLE IF NOT EXISTS entradas (
    id_entrada INT AUTO_INCREMENT PRIMARY KEY,
    id_produto INT NOT NULL,
    data_entrada DATE NOT NULL,
    quantidade INT NOT NULL,
    valor_unitario DECIMAL(10,2) NOT NULL,
    CONSTRAINT fk_entrada_produto FOREIGN KEY (id_produto)
        REFERENCES produtos(id_produto),
    CONSTRAINT chk_entrada_quantidade CHECK (quantidade > 0),
    CONSTRAINT chk_entrada_valor CHECK (valor_unitario > 0)
);

CREATE TABLE IF NOT EXISTS saidas (
    id_saida INT AUTO_INCREMENT PRIMARY KEY,
    id_produto INT NOT NULL,
    data_saida DATE NOT NULL,
    quantidade INT NOT NULL,
    valor_unitario DECIMAL(10,2) NOT NULL,
    CONSTRAINT fk_saida_produto FOREIGN KEY (id_produto)
        REFERENCES produtos(id_produto),
    CONSTRAINT chk_saida_quantidade CHECK (quantidade > 0),
    CONSTRAINT chk_saida_valor CHECK (valor_unitario > 0)
);

INSERT INTO produtos (nome, categoria, unidade_medida, quantidade, valor_unitario) VALUES
('Detergente', 'Limpeza', 'unidade', 50, 3.50),
('Desinfetante', 'Limpeza', 'litro', 40, 7.00),
('Papel toalha', 'Higiene', 'pacote', 30, 12.00);

INSERT INTO entradas (id_produto, data_entrada, quantidade, valor_unitario) VALUES
(1, '2026-10-01', 50, 3.50),
(2, '2026-10-02', 40, 7.00),
(3, '2026-10-03', 30, 12.00);

INSERT INTO saidas (id_produto, data_saida, quantidade, valor_unitario) VALUES
(1, '2026-10-05', 10, 3.50),
(2, '2026-10-06', 5, 7.00),
(3, '2026-10-07', 8, 12.00);

CREATE OR REPLACE VIEW vw_estoque AS
SELECT id_produto, nome, categoria, unidade_medida, quantidade,
       valor_unitario, quantidade * valor_unitario AS valor_total
FROM produtos;

-- Consultas de apoio
SELECT * FROM vw_estoque;
SELECT categoria, SUM(quantidade * valor_unitario) AS valor_total
FROM produtos GROUP BY categoria;
SELECT p.nome, s.quantidade, s.data_saida, s.valor_unitario
FROM saidas s JOIN produtos p ON p.id_produto = s.id_produto
ORDER BY s.data_saida DESC;
