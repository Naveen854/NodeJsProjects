const { format, parse, isValid } = require("date-fns");
const path = require("path");
const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "todoApplication.db");
let db = null;

const initializeDbServer = async () => {
  try {
    db = await open({ filename: dbPath, driver: sqlite3.Database });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (error) {
    console.log(`Db Error : ${error.message}`);
    process.exit(1);
  }
};

initializeDbServer();

const getTransformedTodoArray = (list) => {
  return list.map((eachTodo) => {
    return {
      id: eachTodo["id"],
      todo: eachTodo["todo"],
      priority: eachTodo["priority"],
      category: eachTodo["category"],
      status: eachTodo["status"],
      dueDate: eachTodo["due_date"],
    };
  });
};

const todoArray = {
  priority: ["HIGH", "MEDIUM", "LOW"],
  category: ["WORK", "HOME", "LEARNING"],
  status: ["TO DO", "IN PROGRESS", "DONE"],
};

const invalidResponseTextObject = {
  status: "Invalid Todo Status",
  priority: "Invalid Todo Priority",
  category: "Invalid Todo Category",
  dueDate: "Invalid Due Date",
};

const isValidTodoProperty = (property, value) =>
  todoArray[property].includes(value);

const isValidDueDate = (referenceDate) => {
  const parsedDueDate = parse(referenceDate, "yyyy-MM-dd", new Date());
  return isValid(parsedDueDate);
};

const getFormattedDueDate = (referenceDate) =>
  format(new Date(referenceDate), "yyyy-MM-dd");

const getUpdateTodoQuery = (key, value, todoId) => {
  return `
        UPDATE todo
        SET ${key} = "${value}"
        WHERE id = ${todoId}`;
};

const sendInvalidResponse = (responseObject, invalidKey) => {
  responseObject.status(400);
  responseObject.send(invalidResponseTextObject[invalidKey]);
};

// API 1
app.get("/todos/", async (request, response) => {
  const {
    priority = "",
    category = "",
    status = "",
    search_q = "",
  } = request.query;
  let getTodoQuery = `
        SELECT *
        FROM todo
        WHERE todo LIKE "%${search_q}%"`;

  if (isValidTodoProperty("status", status)) {
    getTodoQuery += ` AND status = "${status}"`;
  } else if (status !== "") {
    console.log("Invalid status");
    sendInvalidResponse(response, "status");
    return;
  }

  if (isValidTodoProperty("priority", priority)) {
    getTodoQuery += ` AND priority = "${priority}"`;
  } else if (priority !== "") {
    console.log("Invalid priority");
    sendInvalidResponse(response, "priority");
    return;
  }

  if (isValidTodoProperty("category", category)) {
    getTodoQuery += ` AND category = "${category}"`;
  } else if (category !== "") {
    console.log("Invalid category");
    sendInvalidResponse(response, "category");
    return;
  }
  const dbResponse = await db.all(getTodoQuery);
  console.log(getTransformedTodoArray(dbResponse));
  response.send(getTransformedTodoArray(dbResponse));
});

// API 2 Returns a specific todo based on the todo ID
app.get("/todos/:todoId/", async (request, response) => {
  const { todoId } = request.params;
  const getTodoQuery = `
        SELECT *
        FROM todo
        WHERE id = ${todoId}`;
  const todoObject = await db.get(getTodoQuery);
  response.send(...getTransformedTodoArray([todoObject]));
});

// APIi 3: /agenda/
app.get("/agenda/", async (request, response) => {
  const { date } = request.query;

  if (isValidDueDate(date)) {
    const formattedDueDate = format(new Date(date), "yyyy-MM-dd");
    const todoWithDueDatesQuery = `
            SELECT *
            FROM
            todo
            WHERE due_date = "${formattedDueDate}"
        `;
    const todoWithDueDatesArray = await db.all(todoWithDueDatesQuery);
    response.send(getTransformedTodoArray(todoWithDueDatesArray));
  } else {
    sendInvalidResponse(response, "dueDate");
  }
});

// API 4
app.post("/todos/", async (request, response) => {
  const { id, todo, priority, status, category, dueDate } = request.body;

  if (!isValidDueDate(dueDate)) {
    sendInvalidResponse(response, "dueDate");
  } else if (!isValidTodoProperty("status", status)) {
    response.status(400);
    response.send(invalidResponseTextObject["status"]);
  } else if (!isValidTodoProperty("priority", priority)) {
    response.status(400);
    response.send(invalidResponseTextObject["priority"]);
  } else if (!isValidTodoProperty("category", category)) {
    response.status(400);
    response.send(invalidResponseTextObject["category"]);
  } else {
    const formattedDueDate = getFormattedDueDate(dueDate);
    const addTodoQuery = `
    INSERT INTO todo(id, todo, priority, status, category, due_date)
    VALUES(${id},"${todo}","${priority}","${status}","${category}","${formattedDueDate}")`;

    await db.run(addTodoQuery);
    response.send("Todo Successfully Added");
  }
});

// API 5 Updates the details of a specific todo based on the todo ID
app.put("/todos/:todoId/", async (request, response) => {
  const { todoId } = request.params;
  const [key, value] = Object.entries(request.body).flat();
  //   console.log(key, value);
  const validResponseTextObject = {
    status: "Status Updated",
    priority: "Priority Updated",
    category: "Category Updated",
    dueDate: "Due Date Updated",
    todo: "Todo Updated",
  };

  if (key === "dueDate") {
    if (isValidDueDate(value)) {
      const formattedDueDate = getFormattedDueDate(value);
      await db.run(getUpdateTodoQuery("due_date", formattedDueDate, todoId));
      response.send("Due Date Updated");
    } else {
      sendInvalidResponse(response, "dueDate");
    }
  } else {
    if (key === "todo") {
      //   console.log(getUpdateTodoQuery(key, value, todoId));
      await db.run(getUpdateTodoQuery(key, value, todoId));
      response.send(validResponseTextObject[key]);
      //   console.log("Success");
    } else if (isValidTodoProperty(key, value)) {
      await db.run(getUpdateTodoQuery(key, value, todoId));
      response.send(validResponseTextObject[key]);
    } else {
      sendInvalidResponse(response, key);
    }
  }
});

// API 6 delte todos
app.delete("/todos/:todoId/", async (request, response) => {
  const { todoId } = request.params;
  const deleteTodoQuery = `
        DELETE FROM todo
        WHERE id = ${todoId}`;
  await db.run(deleteTodoQuery);
  response.send("Todo Deleted");
});

module.exports = app;
