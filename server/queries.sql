
SELECT * FROM sqlite_schema


--select column names in table connection
SELECT ti.name AS 'column'
FROM sqlite_schema AS m,
pragma_table_info(m.name) AS ti
WHERE m.type='table'
AND m.name ='connection'


-- insert test users
INSERT INTO identity (source, source_id, name, avatar_url)
SELECT "placebear", 201, "Leroy Bearkins", "https://placebear.com/g/201/201";
INSERT INTO identity (source, source_id, name, avatar_url)
SELECT "placebear", 202, "Frank Bear", "https://placebear.com/g/202/202";

-- remove old rsa keys
SELECT * FROM connection
--UPDATE connection set publicKey = NULL
WHERE publicKey LIKE '{"alg":"RSA-OAEP-256"%'




--get the 10 most recent messages before the specified timestamp
SELECT * FROM (
SELECT 
dm.id as id, 
cTo.id as toId, 
cFr.id as fromId, 
iFr.id,
iFr.name as fromName,
iTo.id,
iTo.name as toName,
dm.timestamp * 1000 as timestamp
--dm.message
FROM directMessage dm
JOIN connection cTo on cTo.uuid = dm.toUuid
JOIN connection cFr on cFr.uuid = dm.fromUuid
LEFT JOIN identity iFr on iFr.id = cfr.identityId
LEFT JOIN identity iTo on iTo.id = cto.identityId
-- WHERE dm.timestamp <= 1731366829.252
WHERE (
( toUuid in 'abb21c4b-a3a2-4921-b0e3-36342270f191' 
AND fromUuid = '08c4bf39-df01-41de-ab6a-47bcc1edc721'
)
-- OR (
-- toUuid = '08c4bf39-df01-41de-ab6a-47bcc1edc721' 
-- AND fromUuid = 'abb21c4b-a3a2-4921-b0e3-36342270f191')
)
ORDER BY dm.timestamp DESC
LIMIT 10)
ORDER BY id ASC;




WITH UUID1 AS (
	SELECT uuid FROM connection
	WHERE identityId in (
		SELECT identityId FROM connection
		WHERE uuid = 'abb21c4b-a3a2-4921-b0e3-36342270f191'
	)
),
UUID2 AS (
	SELECT uuid FROM connection
	WHERE identityId in (
		SELECT identityId FROM connection
		WHERE uuid = '08c4bf39-df01-41de-ab6a-47bcc1edc721'
	)
)
SELECT * FROM (
		SELECT dm.id as id, 
		cTo.id as toId, 
		cFr.id as fromId,
		iFr.name as fromName,
		dm.timestamp * 1000 as timestamp, 
		dm.message
		FROM directMessage dm
		JOIN connection cTo on cTo.uuid = dm.toUuid
		JOIN connection cFr on cFr.uuid = dm.fromUuid
		LEFT JOIN identity iFr on iFr.id = cfr.identityId
		--WHERE timestamp <= :timestamp
		WHERE (
			(toUuid IN UUID1 AND fromUuid IN UUID2)
			OR 
			(toUuid IN UUID2 AND fromUuid IN UUID1)
		)
		ORDER BY dm.timestamp DESC
		LIMIT 20)
	ORDER BY id ASC;
